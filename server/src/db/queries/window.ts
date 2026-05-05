import type { DB } from '../connection.js';

export interface WindowStats {
  windowActive: boolean;
  windowStart: string | null;
  windowEnd: string | null;
  totalChargeable: number;
  inputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  burnRatePerMin: number;
}

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Claude Code anchors the 5h budget window at the top of the hour of the
 * first message after the previous window closed. So we walk forward through
 * recent turns: each turn either falls inside the active anchor's window, or
 * — if its hour-floor is at/after the previous windowEnd — it opens a new one.
 *
 * `now` is treated as inside the active window only if the most recent anchor's
 * windowEnd has not yet passed.
 */
export function fiveHourWindow(db: DB, now = new Date()): WindowStats {
  // Look back enough to catch the start of any window that could still be open.
  // A window can be at most 5h long, and its anchor floors to the hour, so the
  // anchor is at most 5h - 1ms before now; 6h gives margin.
  const lookbackIso = new Date(now.getTime() - 6 * ONE_HOUR_MS).toISOString();
  const turns = db
    .prepare(
      `SELECT ts FROM turns WHERE ts >= ? ORDER BY ts ASC`,
    )
    .all(lookbackIso) as Array<{ ts: string }>;

  let anchorMs: number | null = null;
  let windowEndMs: number | null = null;
  for (const t of turns) {
    const tMs = new Date(t.ts).getTime();
    if (anchorMs === null || tMs >= windowEndMs!) {
      anchorMs = Math.floor(tMs / ONE_HOUR_MS) * ONE_HOUR_MS;
      windowEndMs = anchorMs + FIVE_HOURS_MS;
    }
  }

  const empty: WindowStats = {
    windowActive: false,
    windowStart: null,
    windowEnd: null,
    totalChargeable: 0,
    inputTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    burnRatePerMin: 0,
  };

  if (anchorMs === null || windowEndMs === null) return empty;
  if (now.getTime() >= windowEndMs) return empty;

  const startIso = new Date(anchorMs).toISOString();
  const endIso = new Date(windowEndMs).toISOString();
  const nowIso = now.toISOString();

  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(input_tokens), 0)          AS input_tokens,
         COALESCE(SUM(output_tokens), 0)         AS output_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
         COALESCE(SUM(cache_read_tokens), 0)     AS cache_read_tokens
       FROM turns WHERE ts >= ? AND ts <= ?`,
    )
    .get(startIso, nowIso) as Record<string, number>;

  // Burn rate over the last 15 minutes, but never reach back before the
  // window's anchor — pre-anchor activity isn't part of "current pace".
  const last15Ms = Math.max(anchorMs, now.getTime() - 15 * 60_000);
  const last15Iso = new Date(last15Ms).toISOString();
  const recent = db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens + cache_creation_tokens), 0) AS chargeable
       FROM turns WHERE ts >= ? AND ts <= ?`,
    )
    .get(last15Iso, nowIso) as { chargeable: number };
  const recentMinutes = Math.max(1, (now.getTime() - last15Ms) / 60_000);

  const inputTokens = row.input_tokens ?? 0;
  const cacheCreationTokens = row.cache_creation_tokens ?? 0;

  return {
    windowActive: true,
    windowStart: startIso,
    windowEnd: endIso,
    totalChargeable: inputTokens + cacheCreationTokens,
    inputTokens,
    cacheCreationTokens,
    outputTokens: row.output_tokens ?? 0,
    cacheReadTokens: row.cache_read_tokens ?? 0,
    burnRatePerMin: (recent.chargeable ?? 0) / recentMinutes,
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
