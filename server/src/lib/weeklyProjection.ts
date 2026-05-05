const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ELAPSED_MS = 60 * 60 * 1000; // 1 hour

export type ProjectionStatus =
  | 'exhausted' // already >= 100%
  | 'will-exhaust' // projection crosses 100% before reset
  | 'pace-warning' // projected final 80-100%
  | 'ok' // projected final < 80%
  | 'insufficient-data'; // elapsed < 1h or percent == 0

export interface WeeklyProjection {
  windowStart: string | null;
  elapsedHours: number | null;
  remainingHours: number | null;
  averagePercentPerHour: number | null;
  projectedFinalPercent: number | null;
  etaToLimitHours: number | null;
  etaToLimitAt: string | null;
  status: ProjectionStatus;
}

/**
 * Project end-of-week utilization at the running average pace.
 *
 * Anthropic's weekly window is 7 days, anchored on its `resets_at` timestamp.
 * We back-derive `windowStart = resets_at - 7d`, compute pace as
 * `percent / elapsed`, then linearly project that to the reset.
 *
 * Returns `insufficient-data` when the window has just begun (elapsed < 1h)
 * or when no usage has been recorded yet — in those cases the ratio is too
 * unstable to be useful.
 */
export function computeWeeklyProjection(
  percent: number,
  resetsAtIso: string | null,
  now: Date = new Date(),
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
  };

  if (!resetsAtIso) return empty;
  const resetsMs = new Date(resetsAtIso).getTime();
  if (!Number.isFinite(resetsMs)) return empty;

  const windowStartMs = resetsMs - SEVEN_DAYS_MS;
  const elapsedMs = Math.max(0, now.getTime() - windowStartMs);
  const remainingMs = Math.max(0, resetsMs - now.getTime());
  const windowStart = new Date(windowStartMs).toISOString();
  const elapsedHours = elapsedMs / (60 * 60 * 1000);
  const remainingHours = remainingMs / (60 * 60 * 1000);

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
    };
  }

  if (elapsedMs < MIN_ELAPSED_MS || percent <= 0) {
    return { ...empty, windowStart, elapsedHours, remainingHours };
  }

  const pacePerHour = percent / elapsedHours;
  const projectedFinal = percent + pacePerHour * remainingHours;
  let status: ProjectionStatus;
  let etaToLimitHours: number | null = null;
  let etaToLimitAt: string | null = null;

  if (projectedFinal >= 100) {
    etaToLimitHours = (100 - percent) / pacePerHour;
    etaToLimitAt = new Date(now.getTime() + etaToLimitHours * 60 * 60 * 1000).toISOString();
    status = 'will-exhaust';
  } else if (projectedFinal >= 80) {
    status = 'pace-warning';
  } else {
    status = 'ok';
  }

  return {
    windowStart,
    elapsedHours,
    remainingHours,
    averagePercentPerHour: pacePerHour,
    projectedFinalPercent: projectedFinal,
    etaToLimitHours,
    etaToLimitAt,
    status,
  };
}
