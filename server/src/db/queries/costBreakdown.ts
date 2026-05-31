import type { DB } from '../connection.js';
import { classifyModel, type ModelFamily } from './modelMix.js';
import { listAliases } from './pathAliases.js';
import { canonicalizePath } from '../../lib/pathAliases.js';
import {
  addBuckets,
  dollarize,
  emptyBuckets,
  PRICING,
  resolveRates,
  type DollarBuckets,
  type ModelRates,
  type TokenBuckets,
} from '../../pricing.js';

export interface ModelBucket extends TokenBuckets, DollarBuckets {
  family: ModelFamily;
}

export interface ProjectCost extends DollarBuckets {
  projectPath: string;
  projectName: string;
  totalTokens: number;
  byModel: ModelBucket[];
}

export interface CostBreakdown {
  days: number;
  /** Pricing table actually used for the math (current Anthropic list rates). */
  pricing: Record<ModelFamily, ModelRates>;
  /** Aggregated totals across every project. */
  total: DollarBuckets & TokenBuckets;
  /** Roll-up per model family across every project. */
  byModel: ModelBucket[];
  /** Per-project totals + per-model-family breakdown. */
  byProject: ProjectCost[];
}

interface Row {
  project_path: string;
  project_name: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_5m: number;
  cache_creation_1h: number;
}

export function costBreakdown(db: DB, days: number): CostBreakdown {
  const allTime = days <= 0;
  const baseSql = `SELECT
         s.project_path,
         MAX(s.project_name)                              AS project_name,
         t.model                                          AS model,
         COALESCE(SUM(t.input_tokens), 0)                 AS input_tokens,
         COALESCE(SUM(t.output_tokens), 0)                AS output_tokens,
         COALESCE(SUM(t.cache_read_tokens), 0)            AS cache_read_tokens,
         COALESCE(SUM(t.cache_creation_5m), 0)            AS cache_creation_5m,
         COALESCE(SUM(t.cache_creation_1h), 0)            AS cache_creation_1h
       FROM sessions s
       JOIN turns t ON t.session_id = s.session_id`;
  const rows = allTime
    ? (db
        .prepare(`${baseSql} GROUP BY s.project_path, t.model`)
        .all() as Row[])
    : (db
        .prepare(`${baseSql} WHERE t.ts >= ? GROUP BY s.project_path, t.model`)
        .all(new Date(Date.now() - days * 86_400_000).toISOString()) as Row[]);

  const aliases = listAliases(db);
  // Rewrite every row's project_path to its canonical form; the rest of the
  // function aggregates by project_path, so merging happens naturally.
  const canonicalNames = new Map<string, string>();
  for (const r of rows) {
    const canonical = canonicalizePath(r.project_path, aliases);
    // Prefer the canonical-path's own project_name when its row is present.
    if (r.project_path === canonical) canonicalNames.set(canonical, r.project_name);
    else if (!canonicalNames.has(canonical)) canonicalNames.set(canonical, r.project_name);
    r.project_path = canonical;
    r.project_name = canonicalNames.get(canonical) ?? r.project_name;
  }
  // Second pass: stamp the resolved name onto every row so downstream
  // aggregation picks the canonical name even when rows were seen out of order.
  for (const r of rows) {
    r.project_name = canonicalNames.get(r.project_path) ?? r.project_name;
  }

  const projectMap = new Map<string, ProjectCost>();
  const globalByModel: Record<ModelFamily, ModelBucket> = {
    opus: makeModelBucket('opus'),
    sonnet: makeModelBucket('sonnet'),
    haiku: makeModelBucket('haiku'),
    other: makeModelBucket('other'),
  };
  const globalTotals = { ...emptyBuckets(), ...zeroDollars() };

  for (const r of rows) {
    const family = classifyModel(r.model);
    const buckets: TokenBuckets = {
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cacheReadTokens: r.cache_read_tokens,
      cacheCreation5mTokens: r.cache_creation_5m,
      cacheCreation1hTokens: r.cache_creation_1h,
    };
    // Version-aware: legacy Opus 4/4.1 cost 3× current Opus 4.5+. Fast mode is
    // not detectable from current JSONL (see detectFastMode), so standard rates.
    const dollars = dollarize(resolveRates(r.model), buckets);

    // per-project
    let project = projectMap.get(r.project_path);
    if (!project) {
      project = {
        projectPath: r.project_path,
        projectName: r.project_name,
        totalTokens: 0,
        byModel: [makeModelBucket('opus'), makeModelBucket('sonnet'), makeModelBucket('haiku'), makeModelBucket('other')],
        ...zeroDollars(),
      };
      projectMap.set(r.project_path, project);
    }
    const projectBucketIdx = familyIndex(family);
    mergeIntoBucket(project.byModel[projectBucketIdx]!, buckets, dollars);
    addDollars(project, dollars);
    project.totalTokens +=
      buckets.inputTokens +
      buckets.outputTokens +
      buckets.cacheReadTokens +
      buckets.cacheCreation5mTokens +
      buckets.cacheCreation1hTokens;

    // global per-model
    mergeIntoBucket(globalByModel[family], buckets, dollars);

    // grand totals
    addBuckets(globalTotals, buckets);
    addDollars(globalTotals, dollars);
  }

  // Drop empty per-project model buckets to keep the payload small.
  for (const p of projectMap.values()) {
    p.byModel = p.byModel.filter(
      (b) =>
        b.inputTokens +
          b.outputTokens +
          b.cacheReadTokens +
          b.cacheCreation5mTokens +
          b.cacheCreation1hTokens >
        0,
    );
  }

  const byProject = [...projectMap.values()].sort((a, b) => b.totalUsd - a.totalUsd);
  const byModel = (Object.values(globalByModel) as ModelBucket[]).filter(
    (b) =>
      b.inputTokens +
        b.outputTokens +
        b.cacheReadTokens +
        b.cacheCreation5mTokens +
        b.cacheCreation1hTokens >
      0,
  );

  return {
    days,
    pricing: PRICING,
    total: globalTotals,
    byModel,
    byProject,
  };
}

function makeModelBucket(family: ModelFamily): ModelBucket {
  return {
    family,
    ...emptyBuckets(),
    ...zeroDollars(),
  };
}

function familyIndex(f: ModelFamily): number {
  return f === 'opus' ? 0 : f === 'sonnet' ? 1 : f === 'haiku' ? 2 : 3;
}

function zeroDollars(): DollarBuckets {
  return {
    inputUsd: 0,
    outputUsd: 0,
    cacheReadUsd: 0,
    cacheCreation5mUsd: 0,
    cacheCreation1hUsd: 0,
    totalUsd: 0,
  };
}

function addDollars(target: DollarBuckets, src: DollarBuckets) {
  target.inputUsd += src.inputUsd;
  target.outputUsd += src.outputUsd;
  target.cacheReadUsd += src.cacheReadUsd;
  target.cacheCreation5mUsd += src.cacheCreation5mUsd;
  target.cacheCreation1hUsd += src.cacheCreation1hUsd;
  target.totalUsd += src.totalUsd;
}

function mergeIntoBucket(
  bucket: ModelBucket,
  tokens: TokenBuckets,
  dollars: DollarBuckets,
) {
  addBuckets(bucket, tokens);
  addDollars(bucket, dollars);
}
