import type { DB } from '../connection.js';
import { classifyModel } from './modelMix.js';

export interface ProjectHeader {
  projectPath: string;
  projectName: string;
  totalTokensLifetime: number;
  totalTokens30d: number;
  totalTokens7d: number;
  sessionCount: number;
  turnCount: number;
  primaryModel: string | null;
  firstActivity: string | null;
  lastActivity: string | null;
  gitBranches: string[];
}

export interface ProjectCacheStats {
  read: number;
  creation: number;
  input: number;
  effectiveness: number;
}

export interface ProjectSubagentStats {
  parentTokens: number;
  subagentTokens: number;
  parentTurns: number;
  subagentTurns: number;
  multiplier: number;
}

export interface CacheTtlSplit {
  creation5m: number;
  creation1h: number;
  ratio1h: number;
}

export interface ProjectActivityPoint {
  date: string;
  chargeable: number;
  totalTokens: number;
  turns: number;
}

export interface TopSession {
  sessionId: string;
  primaryModel: string | null;
  totalTokens: number;
  chargeable: number;
  turnCount: number;
  isSubagent: number;
  lastTs: string;
}

export interface EntrypointStat {
  entrypoint: string;
  sessionCount: number;
}

export interface ModelMixOverTimePoint {
  date: string;
  opus: number;
  sonnet: number;
  haiku: number;
  other: number;
}

export interface CacheOverTimePoint {
  date: string;
  effectiveness: number;
  read: number;
  creation: number;
  input: number;
}

/** Builds `project_path IN (?, ?, ?)` plus the bind array, for prepared statements. */
function pathsIn(col: string, paths: string[]): { sql: string; args: string[] } {
  const ph = paths.map(() => '?').join(',');
  return { sql: `${col} IN (${ph})`, args: paths };
}

export function projectHeader(
  db: DB,
  canonicalPath: string,
  projectPaths: string[],
): ProjectHeader | null {
  if (projectPaths.length === 0) return null;
  const s = pathsIn('project_path', projectPaths);

  const head = db
    .prepare(
      `SELECT
         MAX(project_name) AS project_name,
         COUNT(DISTINCT session_id) AS session_count,
         SUM(turn_count) AS turn_count,
         MIN(first_ts) AS first_ts,
         MAX(last_ts) AS last_ts
       FROM sessions WHERE ${s.sql}`,
    )
    .get(...s.args) as {
      project_name: string | null;
      session_count: number;
      turn_count: number;
      first_ts: string | null;
      last_ts: string | null;
    } | undefined;

  if (!head || !head.project_name) return null;

  const sj = pathsIn('s.project_path', projectPaths);

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS total
       FROM sessions s
       JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql}`,
    )
    .get(...sj.args) as { total: number };

  const totals30 = totalsSince(db, projectPaths, 30);
  const totals7 = totalsSince(db, projectPaths, 7);

  const primaryModel = db
    .prepare(
      `SELECT t.model, SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens) AS tokens
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql}
       GROUP BY t.model ORDER BY tokens DESC LIMIT 1`,
    )
    .get(...sj.args) as { model: string } | undefined;

  const branches = db
    .prepare(
      `SELECT DISTINCT git_branch FROM sessions
       WHERE ${s.sql} AND git_branch IS NOT NULL AND git_branch != ''`,
    )
    .all(...s.args) as Array<{ git_branch: string }>;

  return {
    projectPath: canonicalPath,
    projectName: head.project_name,
    totalTokensLifetime: totals.total,
    totalTokens30d: totals30,
    totalTokens7d: totals7,
    sessionCount: head.session_count,
    turnCount: head.turn_count ?? 0,
    primaryModel: primaryModel?.model ?? null,
    firstActivity: head.first_ts,
    lastActivity: head.last_ts,
    gitBranches: branches.map((b) => b.git_branch),
  };
}

function totalsSince(db: DB, projectPaths: string[], days: number): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const sj = pathsIn('s.project_path', projectPaths);
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS total
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql} AND t.ts >= ?`,
    )
    .get(...sj.args, cutoff) as { total: number };
  return r.total;
}

export function projectCacheStats(
  db: DB,
  projectPaths: string[],
  days: number,
): ProjectCacheStats {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const sj = pathsIn('s.project_path', projectPaths);
  const r = db
    .prepare(
      `SELECT
         COALESCE(SUM(t.cache_read_tokens), 0)     AS read,
         COALESCE(SUM(t.cache_creation_tokens), 0) AS creation,
         COALESCE(SUM(t.input_tokens), 0)          AS input
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql} AND t.ts >= ?`,
    )
    .get(...sj.args, cutoff) as { read: number; creation: number; input: number };
  const denom = r.read + r.creation + r.input;
  return { ...r, effectiveness: denom === 0 ? 0 : r.read / denom };
}

export function projectModelMix(
  db: DB,
  projectPaths: string[],
  days: number,
): { opus: number; sonnet: number; haiku: number; other: number } {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const sj = pathsIn('s.project_path', projectPaths);
  const rows = db
    .prepare(
      `SELECT t.model,
              COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS tokens
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql} AND t.ts >= ?
       GROUP BY t.model`,
    )
    .all(...sj.args, cutoff) as Array<{ model: string; tokens: number }>;
  const acc = { opus: 0, sonnet: 0, haiku: 0, other: 0 };
  for (const r of rows) acc[classifyModel(r.model)] += r.tokens;
  return acc;
}

export function projectActivity(
  db: DB,
  projectPaths: string[],
  days: number,
): ProjectActivityPoint[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const sj = pathsIn('s.project_path', projectPaths);
  const rows = db
    .prepare(
      `SELECT
         strftime('%Y-%m-%d', t.ts) AS date,
         COALESCE(SUM(t.input_tokens + t.cache_creation_tokens), 0) AS chargeable,
         COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS total,
         COUNT(*) AS turns
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql} AND t.ts >= ?
       GROUP BY date ORDER BY date ASC`,
    )
    .all(...sj.args, cutoff) as Array<{
      date: string;
      chargeable: number;
      total: number;
      turns: number;
    }>;
  return rows.map((r) => ({
    date: r.date,
    chargeable: r.chargeable,
    totalTokens: r.total,
    turns: r.turns,
  }));
}

export function projectSubagentStats(
  db: DB,
  projectPaths: string[],
  days: number,
): ProjectSubagentStats {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const sj = pathsIn('s.project_path', projectPaths);
  const r = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN t.is_subagent = 0 THEN t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens ELSE 0 END), 0) AS parent_tokens,
         COALESCE(SUM(CASE WHEN t.is_subagent = 1 THEN t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens ELSE 0 END), 0) AS subagent_tokens,
         COALESCE(SUM(CASE WHEN t.is_subagent = 0 THEN 1 ELSE 0 END), 0) AS parent_turns,
         COALESCE(SUM(CASE WHEN t.is_subagent = 1 THEN 1 ELSE 0 END), 0) AS subagent_turns
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql} AND t.ts >= ?`,
    )
    .get(...sj.args, cutoff) as {
      parent_tokens: number;
      subagent_tokens: number;
      parent_turns: number;
      subagent_turns: number;
    };
  const multiplier = r.parent_tokens === 0 ? 0 : (r.parent_tokens + r.subagent_tokens) / r.parent_tokens;
  return {
    parentTokens: r.parent_tokens,
    subagentTokens: r.subagent_tokens,
    parentTurns: r.parent_turns,
    subagentTurns: r.subagent_turns,
    multiplier,
  };
}

export function projectCacheTtl(
  db: DB,
  projectPaths: string[],
  days: number,
): CacheTtlSplit {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const sj = pathsIn('s.project_path', projectPaths);
  const r = db
    .prepare(
      `SELECT
         COALESCE(SUM(t.cache_creation_5m), 0) AS c5m,
         COALESCE(SUM(t.cache_creation_1h), 0) AS c1h
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql} AND t.ts >= ?`,
    )
    .get(...sj.args, cutoff) as { c5m: number; c1h: number };
  const total = r.c5m + r.c1h;
  return {
    creation5m: r.c5m,
    creation1h: r.c1h,
    ratio1h: total === 0 ? 0 : r.c1h / total,
  };
}

export function projectTopSessions(
  db: DB,
  projectPaths: string[],
  limit = 10,
): TopSession[] {
  const sj = pathsIn('s.project_path', projectPaths);
  const rows = db
    .prepare(
      `SELECT
         s.session_id, s.primary_model, s.last_ts, s.turn_count, s.is_subagent,
         COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS total,
         COALESCE(SUM(t.input_tokens + t.cache_creation_tokens), 0) AS chargeable
       FROM sessions s LEFT JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql}
       GROUP BY s.session_id
       ORDER BY total DESC LIMIT ?`,
    )
    .all(...sj.args, limit) as Array<{
      session_id: string;
      primary_model: string | null;
      last_ts: string;
      turn_count: number;
      is_subagent: number;
      total: number;
      chargeable: number;
    }>;
  return rows.map((r) => ({
    sessionId: r.session_id,
    primaryModel: r.primary_model,
    totalTokens: r.total,
    chargeable: r.chargeable,
    turnCount: r.turn_count,
    isSubagent: r.is_subagent,
    lastTs: r.last_ts,
  }));
}

export function projectEntrypoints(db: DB, projectPaths: string[]): EntrypointStat[] {
  const s = pathsIn('project_path', projectPaths);
  const rows = db
    .prepare(
      `SELECT COALESCE(entrypoint, 'unknown') AS entrypoint, COUNT(*) AS n
       FROM sessions WHERE ${s.sql} GROUP BY entrypoint ORDER BY n DESC`,
    )
    .all(...s.args) as Array<{ entrypoint: string; n: number }>;
  return rows.map((r) => ({ entrypoint: r.entrypoint, sessionCount: r.n }));
}

export function projectModelMixOverTime(
  db: DB,
  projectPaths: string[],
  days: number,
): ModelMixOverTimePoint[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const sj = pathsIn('s.project_path', projectPaths);
  const rows = db
    .prepare(
      `SELECT
         strftime('%Y-%m-%d', t.ts) AS date,
         t.model,
         COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS tokens
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql} AND t.ts >= ?
       GROUP BY date, t.model
       ORDER BY date ASC`,
    )
    .all(...sj.args, cutoff) as Array<{ date: string; model: string; tokens: number }>;
  const map = new Map<string, ModelMixOverTimePoint>();
  for (const r of rows) {
    let pt = map.get(r.date);
    if (!pt) {
      pt = { date: r.date, opus: 0, sonnet: 0, haiku: 0, other: 0 };
      map.set(r.date, pt);
    }
    pt[classifyModel(r.model)] += r.tokens;
  }
  return [...map.values()];
}

export function projectCacheOverTime(
  db: DB,
  projectPaths: string[],
  days: number,
): CacheOverTimePoint[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const sj = pathsIn('s.project_path', projectPaths);
  const rows = db
    .prepare(
      `SELECT
         strftime('%Y-%m-%d', t.ts) AS date,
         COALESCE(SUM(t.cache_read_tokens), 0)     AS read,
         COALESCE(SUM(t.cache_creation_tokens), 0) AS creation,
         COALESCE(SUM(t.input_tokens), 0)          AS input
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE ${sj.sql} AND t.ts >= ?
       GROUP BY date ORDER BY date ASC`,
    )
    .all(...sj.args, cutoff) as Array<{
      date: string;
      read: number;
      creation: number;
      input: number;
    }>;
  return rows.map((r) => {
    const denom = r.read + r.creation + r.input;
    return {
      date: r.date,
      effectiveness: denom === 0 ? 0 : r.read / denom,
      read: r.read,
      creation: r.creation,
      input: r.input,
    };
  });
}
