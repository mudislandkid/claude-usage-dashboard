import type { DB } from '../connection.js';
import { classifyModel, type ModelFamily } from './modelMix.js';

/**
 * Per-model **input** rates ($/MTok) used to derive the dollar premium of a
 * 1h cache write over a 5m one. Cache write multipliers (Anthropic published):
 *   - 5m TTL: 1.25 × input
 *   - 1h TTL: 2.00 × input
 *   - delta:  0.75 × input
 *
 * These are the current public API list prices as of 2026-05 (Opus 4.5/4.6/4.7
 * generation, Sonnet 4.x, Haiku 4.5). Legacy Opus 4.1 / Opus 4 / Opus 3 are
 * priced 3× higher ($15/MTok input), but are deprecated; we use the current
 * rate to match what Anthropic would actually pay today on the same workload.
 *
 * Subscription-plan users pay nothing per token directly, but Anthropic's
 * compute bill scales with these. The cost figures are useful for ecosystem
 * advocacy (filing an issue with Claude Code) even if the user isn't billed
 * personally.
 */
const INPUT_RATE_PER_MTOK: Record<ModelFamily, number> = {
  opus: 5, // Opus 4.5+, was $15 for legacy Opus 4.1/4/3
  sonnet: 3, // Sonnet 4.x and 3.7
  haiku: 1, // Haiku 4.5; legacy Haiku 3.5 was $0.80
  other: 3, // unknown model family — use Sonnet rate as a reasonable mid-point
};
const TTL_PREMIUM_FACTOR = 0.75; // (2.00 - 1.25)

const HISTOGRAM_BUCKETS_MIN: Array<{ label: string; loMin: number; hiMin: number }> = [
  { label: '<1m', loMin: 0, hiMin: 1 },
  { label: '1–5m', loMin: 1, hiMin: 5 },
  { label: '5–15m', loMin: 5, hiMin: 15 },
  { label: '15–30m', loMin: 15, hiMin: 30 },
  { label: '30–60m', loMin: 30, hiMin: 60 },
  { label: '>60m', loMin: 60, hiMin: Infinity },
  { label: 'no follow-up', loMin: -1, hiMin: -1 }, // sentinel
];

export interface TtlEfficiencyRow {
  bucket: string;
  writes: number;
  tokens: number;
}

export interface CacheTtlEfficiency {
  days: number;
  totals: {
    writes5m: number;
    writes1h: number;
    tokens5m: number;
    tokens1h: number;
    share1hByTokens: number; // 0..1
  };
  classification: {
    // Shadow-cache simulation methodology:
    //   For each 1h write at time T, walk forward through every cache read in
    //   the same session. Maintain two shadow caches — one with 5m TTL, one
    //   with 1h TTL — both refreshed on every read. Mark the write "useful"
    //   only if, at some point, a read would have been a HIT under the 1h
    //   shadow but a MISS under the 5m shadow (i.e. the gap from the previous
    //   read or write exceeded 5 min, so a 5m TTL would have already expired).
    //   Mark "wasted-5m-suffices" when the 5m shadow never died before a read
    //   landed (interactive cadence kept refreshing it). Mark "stale" when no
    //   read landed at all within 60 min.
    //
    // This is the only methodology that actually models the TTL refresh
    // behavior. The two simpler heuristics (next-turn-<5min, or any-read-in-
    // 5-60min) under- and over-count respectively in the very common
    // continuous-interactive case.
    usefulTokens: number;
    wasted5mTokens: number;
    staleTokens: number;
    usefulWrites: number;
    wasted5mWrites: number;
    staleWrites: number;
    wasteRatio: number; // (wasted + stale) / total tokens
  };
  histogram: TtlEfficiencyRow[]; // gap from 1h-write to NEXT cache read
  cost: {
    perModel: Array<{
      model: ModelFamily;
      wastedTokens: number;
      premiumUsd: number;
    }>;
    totalPremiumUsdMonthly: number; // scaled to 30d
    totalPremiumUsdSampled: number; // raw over the lookback window
    methodology: string;
  };
}

interface SessionTurn {
  session_id: string;
  ts: string;
  cache_creation_1h: number;
  cache_read_tokens: number;
  model: string | null;
}

const FIVE_MIN_MS = 5 * 60_000;
const ONE_HOUR_MS = 60 * 60_000;

type Classification = 'useful' | 'wasted5m' | 'stale';

/**
 * Walk forward from a 1h write through subsequent cache reads in the same
 * session, tracking shadow 5m and 1h TTLs that refresh on every read. The
 * write is "useful" only if a read lands that the 5m shadow would have missed
 * but the 1h shadow still serves.
 */
export function classifyByShadowSimulation(
  writeMs: number,
  subsequentReadMs: number[],
): { classification: Classification; firstReadGapMin: number | null } {
  let last5mAlive = writeMs + FIVE_MIN_MS;
  let last1hAlive = writeMs + ONE_HOUR_MS;
  let alive5m = true;
  let alive1h = true;
  let usefulFor1h = false;
  let anyReadHit = false;
  let firstReadGapMin: number | null = null;

  for (const readMs of subsequentReadMs) {
    if (firstReadGapMin === null) {
      firstReadGapMin = (readMs - writeMs) / 60_000;
    }
    if (alive5m && readMs > last5mAlive) alive5m = false;
    if (alive1h && readMs > last1hAlive) alive1h = false;
    if (!alive1h) break; // 1h cache is dead; nothing further can help this write
    anyReadHit = true;
    if (!alive5m) usefulFor1h = true;
    if (alive5m) last5mAlive = readMs + FIVE_MIN_MS;
    last1hAlive = readMs + ONE_HOUR_MS;
  }

  if (usefulFor1h) return { classification: 'useful', firstReadGapMin };
  return {
    classification: anyReadHit ? 'wasted5m' : 'stale',
    firstReadGapMin,
  };
}

export function cacheTtlEfficiency(db: DB, days: number): CacheTtlEfficiency {
  const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString();

  const totalsRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN cache_creation_5m > 0 THEN 1 ELSE 0 END), 0) AS writes_5m,
         COALESCE(SUM(CASE WHEN cache_creation_1h > 0 THEN 1 ELSE 0 END), 0) AS writes_1h,
         COALESCE(SUM(cache_creation_5m), 0) AS tokens_5m,
         COALESCE(SUM(cache_creation_1h), 0) AS tokens_1h
       FROM turns WHERE ts >= ?`,
    )
    .get(cutoffIso) as Record<string, number>;

  const tokens5m = totalsRow.tokens_5m ?? 0;
  const tokens1h = totalsRow.tokens_1h ?? 0;
  const totalCacheTokens = tokens5m + tokens1h;
  const share1hByTokens = totalCacheTokens > 0 ? tokens1h / totalCacheTokens : 0;

  // Bulk-load all relevant turns ordered by session, then time. Group in JS
  // and run the shadow simulation per write. Avoids N^2 SQL subqueries.
  const turns = db
    .prepare(
      `SELECT session_id, ts, cache_creation_1h, cache_read_tokens, model
       FROM turns
       WHERE ts >= ?
         AND (cache_creation_1h > 0 OR cache_read_tokens > 0)
       ORDER BY session_id ASC, ts ASC`,
    )
    .all(cutoffIso) as SessionTurn[];

  let usefulTokens = 0,
    wasted5mTokens = 0,
    staleTokens = 0;
  let usefulWrites = 0,
    wasted5mWrites = 0,
    staleWrites = 0;

  const buckets = HISTOGRAM_BUCKETS_MIN.map((b) => ({ ...b, writes: 0, tokens: 0 }));
  const wastedByModel = new Map<ModelFamily, number>();

  // Group turns by session
  const bySession = new Map<string, SessionTurn[]>();
  for (const t of turns) {
    let arr = bySession.get(t.session_id);
    if (!arr) {
      arr = [];
      bySession.set(t.session_id, arr);
    }
    arr.push(t);
  }

  for (const sessionTurns of bySession.values()) {
    // Pre-compute read timestamps in ms for this session
    const readMsAll: number[] = [];
    for (const t of sessionTurns) {
      if (t.cache_read_tokens > 0) readMsAll.push(new Date(t.ts).getTime());
    }
    let readCursor = 0;
    for (const t of sessionTurns) {
      if (t.cache_creation_1h <= 0) continue;
      const writeMs = new Date(t.ts).getTime();
      // Advance cursor to first read strictly after writeMs (sessions sorted asc)
      while (readCursor < readMsAll.length && readMsAll[readCursor]! <= writeMs) {
        readCursor += 1;
      }
      const subsequent = readMsAll.slice(readCursor);
      const { classification, firstReadGapMin } = classifyByShadowSimulation(
        writeMs,
        subsequent,
      );

      if (classification === 'useful') {
        usefulTokens += t.cache_creation_1h;
        usefulWrites += 1;
      } else if (classification === 'wasted5m') {
        wasted5mTokens += t.cache_creation_1h;
        wasted5mWrites += 1;
        addWaste(wastedByModel, t.model, t.cache_creation_1h);
      } else {
        staleTokens += t.cache_creation_1h;
        staleWrites += 1;
        addWaste(wastedByModel, t.model, t.cache_creation_1h);
      }

      // Histogram: gap from the WRITE to the first read after it
      if (firstReadGapMin === null) {
        const b = buckets[buckets.length - 1]!; // "no follow-up"
        b.writes += 1;
        b.tokens += t.cache_creation_1h;
      } else {
        for (let i = 0; i < buckets.length - 1; i++) {
          const b = buckets[i]!;
          if (firstReadGapMin >= b.loMin && firstReadGapMin < b.hiMin) {
            b.writes += 1;
            b.tokens += t.cache_creation_1h;
            break;
          }
        }
      }
    }
  }

  const totalAnalyzed = usefulTokens + wasted5mTokens + staleTokens;
  const wasteRatio = totalAnalyzed > 0 ? (wasted5mTokens + staleTokens) / totalAnalyzed : 0;

  const perModel: Array<{ model: ModelFamily; wastedTokens: number; premiumUsd: number }> = [];
  let totalPremiumUsdSampled = 0;
  for (const family of ['opus', 'sonnet', 'haiku', 'other'] as const) {
    const w = wastedByModel.get(family) ?? 0;
    if (w === 0) continue;
    const rate = INPUT_RATE_PER_MTOK[family];
    const premium = (w / 1_000_000) * rate * TTL_PREMIUM_FACTOR;
    perModel.push({ model: family, wastedTokens: w, premiumUsd: premium });
    totalPremiumUsdSampled += premium;
  }
  const totalPremiumUsdMonthly =
    days > 0 ? totalPremiumUsdSampled * (30 / days) : totalPremiumUsdSampled;

  return {
    days,
    totals: {
      writes5m: totalsRow.writes_5m ?? 0,
      writes1h: totalsRow.writes_1h ?? 0,
      tokens5m,
      tokens1h,
      share1hByTokens,
    },
    classification: {
      usefulTokens,
      wasted5mTokens,
      staleTokens,
      usefulWrites,
      wasted5mWrites,
      staleWrites,
      wasteRatio,
    },
    histogram: buckets.map((b) => ({ bucket: b.label, writes: b.writes, tokens: b.tokens })),
    cost: {
      perModel,
      totalPremiumUsdMonthly,
      totalPremiumUsdSampled,
      methodology:
        'Shadow-cache simulation. For each 1h write, walk forward through subsequent cache reads in the same session, refreshing both a 5m and a 1h shadow TTL on each read (cache hits refresh the TTL clock). The write is "useful" only when a read lands that the 5m shadow would have missed but the 1h shadow still serves. "Wasted-5m-suffices" means continuous reads kept the 5m shadow alive so 1h provided no benefit. "Stale" means the 1h cache expired with no reads. This is more accurate than the next-turn-<5min upper bound (which ignores later reads) and the any-read-in-5–60min lower bound (which over-credits the 1h when reads continuously refresh the 5m shadow).',
    },
  };
}

function addWaste(map: Map<ModelFamily, number>, model: string | null, amount: number): void {
  const family = classifyModel(model);
  map.set(family, (map.get(family) ?? 0) + amount);
}
