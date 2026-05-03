import type { DB } from '../connection.js';

export interface WindowStats {
  windowStart: string;
  windowEnd: string;
  totalChargeable: number;
  inputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  burnRatePerMin: number;
}

export function fiveHourWindow(db: DB, now = new Date()): WindowStats {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const last15Start = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

  const row = db.prepare(
    `SELECT
       COALESCE(SUM(input_tokens), 0)          AS input_tokens,
       COALESCE(SUM(output_tokens), 0)         AS output_tokens,
       COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
       COALESCE(SUM(cache_read_tokens), 0)     AS cache_read_tokens
     FROM turns WHERE ts >= ? AND ts <= ?`,
  ).get(start, end) as Record<string, number>;

  const recent = db.prepare(
    `SELECT COALESCE(SUM(input_tokens + cache_creation_tokens), 0) AS chargeable
     FROM turns WHERE ts >= ? AND ts <= ?`,
  ).get(last15Start, end) as { chargeable: number };

  const totalChargeable = (row.input_tokens ?? 0) + (row.cache_creation_tokens ?? 0);

  return {
    windowStart: start,
    windowEnd: end,
    totalChargeable,
    inputTokens: row.input_tokens ?? 0,
    cacheCreationTokens: row.cache_creation_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    cacheReadTokens: row.cache_read_tokens ?? 0,
    burnRatePerMin: (recent.chargeable ?? 0) / 15,
  };
}

export interface PeakWindow {
  days: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  samples: number;
}

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

/**
 * For each assistant turn in the last `days`, compute the rolling 5h
 * chargeable-token sum ending at that turn. Return percentiles + max
 * across those window snapshots. Used by the Settings auto-calibrate
 * feature to suggest a personalized window limit.
 */
export function peakWindow(db: DB, days: number): PeakWindow {
  const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString();

  const rows = db
    .prepare(
      `SELECT ts, (input_tokens + cache_creation_tokens) AS chargeable
       FROM turns
       WHERE ts >= ?
       ORDER BY ts ASC`,
    )
    .all(cutoffIso) as Array<{ ts: string; chargeable: number }>;

  if (rows.length === 0) {
    return { days, p50: 0, p95: 0, p99: 0, max: 0, samples: 0 };
  }

  const timestamps = rows.map((r) => new Date(r.ts).getTime());
  const charges = rows.map((r) => r.chargeable);

  const windowSums: number[] = [];
  let lo = 0;
  let sum = 0;
  for (let hi = 0; hi < rows.length; hi++) {
    sum += charges[hi]!;
    while (lo <= hi && timestamps[hi]! - timestamps[lo]! > FIVE_HOURS_MS) {
      sum -= charges[lo]!;
      lo += 1;
    }
    windowSums.push(sum);
  }

  windowSums.sort((a, b) => a - b);
  const pick = (p: number): number => {
    const idx = Math.min(windowSums.length - 1, Math.floor(windowSums.length * p));
    return windowSums[idx] ?? 0;
  };

  return {
    days,
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    max: windowSums[windowSums.length - 1] ?? 0,
    samples: windowSums.length,
  };
}
