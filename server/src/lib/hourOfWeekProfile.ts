import type { DB } from '../db/connection.js';

/**
 * Profile of usage shape across the 168 hours of a week.
 * `weights[i]` is the fraction of an average week's chargeable tokens that land
 * in slot `i`, where `i = weekday * 24 + hour` and `weekday` follows SQLite's
 * `strftime('%w', ...)` convention (0 = Sunday, 6 = Saturday) in UTC.
 *
 * `Σ weights == 1.0` after normalization. Returned `null` when there isn't
 * enough history to be meaningful — the caller should fall back to the flat
 * linear projection in that case.
 */
export interface HourOfWeekProfile {
  weights: Float64Array; // length 168
  /** Number of weeks of history that contributed to the profile (fractional). */
  weeksOfHistory: number;
  /** Total chargeable tokens observed across the window. */
  observedTokens: number;
}

const SLOTS = 168;
const MIN_WEEKS = 1; // need at least one full week of history
const SMOOTH_RADIUS = 1; // 3-slot rolling average to dampen noisy idle hours
/**
 * Per-week decay for recency weighting. A `weeks-ago` bucket `k` contributes
 * `RECENCY_DECAY ** k` to the profile, so the most recent week dominates and a
 * one-off holiday three weeks back barely registers.
 *
 *   decay = 0.5 → last week ≈ 53% of mass over a 4-week lookback
 *   decay = 0.7 → last week ≈ 39%
 *
 * 0.5 is intentionally aggressive: it lets a real change in routine take
 * effect within a few days rather than half a month.
 */
const RECENCY_DECAY = 0.5;

export function buildHourOfWeekProfile(
  db: DB,
  lookbackDays: number = 28,
  now: Date = new Date(),
): HourOfWeekProfile | null {
  const cutoff = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString();
  const nowIso = now.toISOString();
  // Use chargeable tokens (input + cache_creation) — those are what actually
  // count toward the weekly cap, so the shape best matches what burns %.
  // Group additionally by `weeks_ago` so we can apply EMA-style recency
  // weighting in TS — the latest week counts more than older weeks.
  const rows = db
    .prepare(
      `SELECT
         CAST(strftime('%w', ts) AS INTEGER) AS weekday,
         CAST(strftime('%H', ts) AS INTEGER) AS hour,
         CAST((julianday(?) - julianday(ts)) / 7 AS INTEGER) AS weeks_ago,
         COALESCE(SUM(input_tokens + cache_creation_tokens), 0) AS tokens
       FROM turns
       WHERE ts >= ?
       GROUP BY weekday, hour, weeks_ago`,
    )
    .all(nowIso, cutoff) as Array<{
      weekday: number;
      hour: number;
      weeks_ago: number;
      tokens: number;
    }>;

  const raw = new Float64Array(SLOTS);
  let total = 0;
  for (const r of rows) {
    const idx = r.weekday * 24 + r.hour;
    if (idx < 0 || idx >= SLOTS) continue;
    const decay = Math.pow(RECENCY_DECAY, Math.max(0, r.weeks_ago));
    const weighted = r.tokens * decay;
    raw[idx]! += weighted;
    total += weighted;
  }

  if (total <= 0) return null;

  // Determine how many weeks of history we actually have. If the oldest turn
  // is younger than 7 days, the profile is too thin to trust.
  const firstTurn = db
    .prepare(`SELECT MIN(ts) AS first_ts FROM turns WHERE ts >= ?`)
    .get(cutoff) as { first_ts: string | null };
  const oldestMs = firstTurn?.first_ts ? new Date(firstTurn.first_ts).getTime() : now.getTime();
  const weeksOfHistory = (now.getTime() - oldestMs) / (7 * 86_400_000);
  if (weeksOfHistory < MIN_WEEKS) return null;

  // Smooth across hours so a single dead 3am slot doesn't dominate.
  const smoothed = new Float64Array(SLOTS);
  for (let i = 0; i < SLOTS; i++) {
    let acc = 0;
    let n = 0;
    for (let d = -SMOOTH_RADIUS; d <= SMOOTH_RADIUS; d++) {
      acc += raw[(i + d + SLOTS) % SLOTS]!;
      n += 1;
    }
    smoothed[i] = acc / n;
  }

  // Add a tiny epsilon so every slot has non-zero weight (prevents a future
  // "all-zeros" stretch from making cumulative weight collapse to 0).
  // Epsilon = 1/168 of 1% of total smoothed mass.
  const meanWeight = smoothed.reduce((a, b) => a + b, 0) / SLOTS;
  const eps = meanWeight * 0.01;
  let smoothedTotal = 0;
  for (let i = 0; i < SLOTS; i++) {
    smoothed[i] = smoothed[i]! + eps;
    smoothedTotal += smoothed[i]!;
  }

  const weights = new Float64Array(SLOTS);
  for (let i = 0; i < SLOTS; i++) weights[i] = smoothed[i]! / smoothedTotal;

  return { weights, weeksOfHistory, observedTokens: total };
}

/** Hour-of-week slot index for a UTC timestamp. */
export function hourOfWeekSlot(date: Date): number {
  return date.getUTCDay() * 24 + date.getUTCHours();
}
