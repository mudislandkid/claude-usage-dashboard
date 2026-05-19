import type { HourOfWeekProfile } from './hourOfWeekProfile.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_ELAPSED_MS = 60 * 60 * 1000; // 1 hour
const MIN_ELAPSED_WEIGHT = 0.005; // ≥0.5% of weekly weight before we trust the projection

export type ProjectionStatus =
  | 'exhausted' // already >= 100%
  | 'will-exhaust' // projection crosses 100% before reset
  | 'pace-warning' // projected final 80-100%
  | 'ok' // projected final < 80%
  | 'insufficient-data'; // elapsed < 1h or percent == 0

export type ProjectionMethod = 'time-of-day' | 'linear';

export interface WeeklyProjection {
  windowStart: string | null;
  elapsedHours: number | null;
  remainingHours: number | null;
  averagePercentPerHour: number | null;
  projectedFinalPercent: number | null;
  etaToLimitHours: number | null;
  etaToLimitAt: string | null;
  status: ProjectionStatus;
  /** Which algorithm produced the projection — useful for the UI tooltip. */
  method: ProjectionMethod;
}

/**
 * Project end-of-week utilization, optionally weighted by the user's
 * observed hour-of-week usage shape.
 *
 * When `profile` is supplied, the projection treats the remaining time as
 * a *weighted* sum: a typically-quiet stretch (e.g. overnight) contributes
 * less projected % than an active stretch of the same length. This gives a
 * realistic estimate when the user's usage clusters in specific hours of
 * the day or days of the week.
 *
 * When `profile` is `null`, falls back to flat linear extrapolation.
 *
 * In both cases the % input is Anthropic's official 7-day usage — we never
 * try to infer it ourselves.
 */
export function computeWeeklyProjection(
  percent: number,
  resetsAtIso: string | null,
  now: Date = new Date(),
  profile: HourOfWeekProfile | null = null,
): WeeklyProjection {
  const empty: WeeklyProjection = {
    windowStart: null,
    elapsedHours: null,
    remainingHours: null,
    averagePercentPerHour: null,
    projectedFinalPercent: null,
    etaToLimitHours: null,
    etaToLimitAt: null,
    status: 'insufficient-data',
    method: 'linear',
  };

  if (!resetsAtIso) return empty;
  const resetsMs = new Date(resetsAtIso).getTime();
  if (!Number.isFinite(resetsMs)) return empty;

  const windowStartMs = resetsMs - SEVEN_DAYS_MS;
  const elapsedMs = Math.max(0, now.getTime() - windowStartMs);
  const remainingMs = Math.max(0, resetsMs - now.getTime());
  const windowStart = new Date(windowStartMs).toISOString();
  const elapsedHours = elapsedMs / HOUR_MS;
  const remainingHours = remainingMs / HOUR_MS;

  if (percent >= 100) {
    return {
      windowStart,
      elapsedHours,
      remainingHours,
      averagePercentPerHour: null,
      projectedFinalPercent: 100,
      etaToLimitHours: 0,
      etaToLimitAt: now.toISOString(),
      status: 'exhausted',
      method: profile ? 'time-of-day' : 'linear',
    };
  }

  if (elapsedMs < MIN_ELAPSED_MS || percent <= 0) {
    return { ...empty, windowStart, elapsedHours, remainingHours };
  }

  if (profile) {
    const weighted = projectWeighted(
      percent,
      windowStartMs,
      resetsMs,
      now,
      profile,
    );
    if (weighted) return { windowStart, elapsedHours, remainingHours, ...weighted };
    // else fall through to linear
  }

  return {
    windowStart,
    elapsedHours,
    remainingHours,
    ...projectLinear(percent, elapsedHours, remainingHours, now),
  };
}

interface CoreProjection {
  averagePercentPerHour: number | null;
  projectedFinalPercent: number | null;
  etaToLimitHours: number | null;
  etaToLimitAt: string | null;
  status: ProjectionStatus;
  method: ProjectionMethod;
}

function projectLinear(
  percent: number,
  elapsedHours: number,
  remainingHours: number,
  now: Date,
): CoreProjection {
  const pacePerHour = percent / elapsedHours;
  const projectedFinal = percent + pacePerHour * remainingHours;
  return classify(percent, pacePerHour, projectedFinal, now, 'linear', (gap) =>
    gap / pacePerHour,
  );
}

/**
 * Walk the time-line in hour-slices from windowStart to resetsAt, summing
 * each slice's hour-of-week weight from the profile. We get:
 *   elapsedWeight = Σ w(slot) for windowStart → now
 *   remainingWeight = Σ w(slot) for now → resetsAt
 *
 * If `percent` accumulated over `elapsedWeight` of the weekly weight, the
 * full-week projection is `percent / elapsedWeight` (since elapsed+remaining
 * weight sums to ~1 across a full 7-day stretch).
 *
 * Returns `null` if elapsed weight is too small to extrapolate from.
 */
function projectWeighted(
  percent: number,
  windowStartMs: number,
  resetsMs: number,
  now: Date,
  profile: HourOfWeekProfile,
): CoreProjection | null {
  const segments = weightedSegments(windowStartMs, resetsMs, now.getTime(), profile);
  const { elapsedWeight, remainingWeight } = segments;
  if (elapsedWeight < MIN_ELAPSED_WEIGHT) return null;

  // Closed-form total: percent / elapsedWeight = full-week expectation,
  // then projected = elapsedShare + remainingShare = percent + percent * (remainingWeight/elapsedWeight)
  const projectedFinal = percent + percent * (remainingWeight / elapsedWeight);

  // Equivalent "average %/h" for compatibility with the existing UI —
  // express the weighted rate as a per-real-hour figure so the dashboard
  // still has something to show.
  const remainingHours = (resetsMs - now.getTime()) / HOUR_MS;
  const pacePerHour = remainingHours > 0
    ? (projectedFinal - percent) / remainingHours
    : null;

  return classify(percent, pacePerHour, projectedFinal, now, 'time-of-day', (gap) =>
    etaWeighted(gap, percent, elapsedWeight, now.getTime(), resetsMs, profile),
  );
}

function classify(
  percent: number,
  pacePerHour: number | null,
  projectedFinal: number,
  now: Date,
  method: ProjectionMethod,
  etaSolver: (gap: number) => number | null,
): CoreProjection {
  let status: ProjectionStatus;
  let etaToLimitHours: number | null = null;
  let etaToLimitAt: string | null = null;
  if (projectedFinal >= 100) {
    const eta = etaSolver(100 - percent);
    if (eta !== null && Number.isFinite(eta) && eta >= 0) {
      etaToLimitHours = eta;
      etaToLimitAt = new Date(now.getTime() + eta * HOUR_MS).toISOString();
    }
    status = 'will-exhaust';
  } else if (projectedFinal >= 80) {
    status = 'pace-warning';
  } else {
    status = 'ok';
  }
  return {
    averagePercentPerHour: pacePerHour,
    projectedFinalPercent: projectedFinal,
    etaToLimitHours,
    etaToLimitAt,
    status,
    method,
  };
}

/**
 * Time-of-day ETA: walk forward hour-by-hour from `now` accumulating weight,
 * stopping when we've added enough future weight to reach `gap` percent.
 *
 * gap = points still to consume to hit 100.
 * Each future hour adds  `percent / elapsedWeight * w(slot)` percent.
 * So we need cumulative future weight >= `gap * elapsedWeight / percent`.
 */
function etaWeighted(
  gap: number,
  percent: number,
  elapsedWeight: number,
  nowMs: number,
  resetsMs: number,
  profile: HourOfWeekProfile,
): number | null {
  if (gap <= 0) return 0;
  const required = (gap * elapsedWeight) / percent;
  let cum = 0;
  let cursorMs = nowMs;
  // Iterate in 1-hour increments, but handle the partial first hour separately.
  // Cap iteration at 8 weeks to defend against pathological profiles where
  // cumulative weight never reaches `required` (shouldn't happen with epsilon
  // floor, but safety net).
  const MAX_HOURS = 24 * 7 * 8;
  for (let step = 0; step < MAX_HOURS; step++) {
    const slot = hourOfWeekSlotMs(cursorMs);
    const hourBoundary = Math.ceil(cursorMs / HOUR_MS) * HOUR_MS;
    const sliceEnd = Math.min(hourBoundary === cursorMs ? cursorMs + HOUR_MS : hourBoundary, resetsMs);
    const sliceMs = sliceEnd - cursorMs;
    if (sliceMs <= 0) break;
    const sliceFrac = sliceMs / HOUR_MS;
    const w = profile.weights[slot]! * sliceFrac;
    if (cum + w >= required) {
      const need = required - cum;
      const partialFrac = w === 0 ? 0 : need / w;
      const elapsedFromNow = (cursorMs - nowMs) / HOUR_MS + partialFrac * sliceFrac;
      return elapsedFromNow;
    }
    cum += w;
    cursorMs = sliceEnd;
    if (cursorMs >= resetsMs) {
      // Reset arrives before we cross 100%: shouldn't happen since classify
      // only calls this when projectedFinal >= 100. Defensive fallback.
      return null;
    }
  }
  return null;
}

interface WeightedSegments {
  elapsedWeight: number;
  remainingWeight: number;
}

/** Sum hour-of-week weights over (windowStart→now) and (now→resetsAt). */
function weightedSegments(
  windowStartMs: number,
  resetsMs: number,
  nowMs: number,
  profile: HourOfWeekProfile,
): WeightedSegments {
  let elapsedWeight = 0;
  let remainingWeight = 0;
  // Walk in hour-slices. The boundaries may not align with hour ticks, so
  // the first and last slice can be partial.
  const total = 168;
  let cursor = windowStartMs;
  while (cursor < resetsMs) {
    const slot = hourOfWeekSlotMs(cursor);
    const nextHour = Math.floor(cursor / HOUR_MS + 1) * HOUR_MS;
    const sliceEnd = Math.min(nextHour, resetsMs);
    const sliceMs = sliceEnd - cursor;
    const sliceHours = sliceMs / HOUR_MS;
    const w = profile.weights[slot]! * sliceHours;
    if (sliceEnd <= nowMs) {
      elapsedWeight += w;
    } else if (cursor >= nowMs) {
      remainingWeight += w;
    } else {
      // Slice straddles `now` — split it.
      const elapsedFrac = (nowMs - cursor) / sliceMs;
      elapsedWeight += w * elapsedFrac;
      remainingWeight += w * (1 - elapsedFrac);
    }
    cursor = sliceEnd;
    // safety: shouldn't loop past total hours
    if ((cursor - windowStartMs) / HOUR_MS > total + 1) break;
  }
  return { elapsedWeight, remainingWeight };
}

function hourOfWeekSlotMs(ms: number): number {
  const d = new Date(ms);
  return d.getUTCDay() * 24 + d.getUTCHours();
}
