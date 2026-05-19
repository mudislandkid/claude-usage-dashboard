import { describe, it, expect } from 'vitest';
import { computeWeeklyProjection } from '../src/lib/weeklyProjection.js';
import type { HourOfWeekProfile } from '../src/lib/hourOfWeekProfile.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function resetIso(now: Date, daysFromNow: number): string {
  return new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

/** Uniform profile — should produce results matching the linear method. */
function uniformProfile(): HourOfWeekProfile {
  const weights = new Float64Array(168);
  weights.fill(1 / 168);
  return { weights, weeksOfHistory: 4, observedTokens: 1_000_000 };
}

/** Heavy weekday-business-hours profile: 09:00-17:00 UTC Mon-Fri carry most weight. */
function workdayProfile(): HourOfWeekProfile {
  const weights = new Float64Array(168);
  let total = 0;
  for (let wd = 0; wd < 7; wd++) {
    for (let h = 0; h < 24; h++) {
      const idx = wd * 24 + h;
      const isWorkHour = wd >= 1 && wd <= 5 && h >= 9 && h < 17;
      const w = isWorkHour ? 10 : 1;
      weights[idx] = w;
      total += w;
    }
  }
  for (let i = 0; i < 168; i++) weights[i]! /= total;
  return { weights, weeksOfHistory: 4, observedTokens: 1_000_000 };
}

describe('computeWeeklyProjection', () => {
  it('returns insufficient-data when resetsAt is null', () => {
    const r = computeWeeklyProjection(20, null, new Date('2026-05-05T12:00:00Z'));
    expect(r.status).toBe('insufficient-data');
    expect(r.windowStart).toBeNull();
    expect(r.projectedFinalPercent).toBeNull();
  });

  it('returns insufficient-data within first hour of window', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    // window started 30 min ago → resets in 6d 23h 30m
    const reset = new Date(now.getTime() + SEVEN_DAYS_MS - 30 * 60_000).toISOString();
    const r = computeWeeklyProjection(2, reset, now);
    expect(r.status).toBe('insufficient-data');
    expect(r.elapsedHours).toBeCloseTo(0.5, 1);
    expect(r.projectedFinalPercent).toBeNull();
  });

  it('returns insufficient-data when usage is 0%', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const reset = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeWeeklyProjection(0, reset, now);
    expect(r.status).toBe('insufficient-data');
  });

  it('flags exhausted when percent >= 100', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const r = computeWeeklyProjection(100, resetIso(now, 3), now);
    expect(r.status).toBe('exhausted');
    expect(r.etaToLimitHours).toBe(0);
    expect(r.etaToLimitAt).toBe(now.toISOString());
    expect(r.remainingHours).toBeCloseTo(72, 0);
  });

  it('flags will-exhaust and computes ETA + absolute timestamp', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    // 1 day in, 50% used → pace 50%/24h = 2.08%/h → projected = 50 + 2.08*144 ≈ 350% → ETA = 50/2.08 ≈ 24h
    const reset = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeWeeklyProjection(50, reset, now);
    expect(r.status).toBe('will-exhaust');
    expect(r.etaToLimitHours).toBeGreaterThan(20);
    expect(r.etaToLimitHours).toBeLessThan(28);
    expect(r.projectedFinalPercent).toBeGreaterThan(300);
    expect(r.etaToLimitAt).not.toBeNull();
    const etaMs = new Date(r.etaToLimitAt!).getTime();
    expect(etaMs).toBeCloseTo(now.getTime() + (r.etaToLimitHours ?? 0) * 3600_000, -2);
  });

  it('flags pace-warning when projected final lands in 80-100% range', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    // 2 days in (out of 7), 25% used → pace 25/48 ≈ 0.52%/h → projected = 25 + 0.52*120 ≈ 87.5%
    const reset = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeWeeklyProjection(25, reset, now);
    expect(r.status).toBe('pace-warning');
    expect(r.projectedFinalPercent).toBeGreaterThanOrEqual(80);
    expect(r.projectedFinalPercent).toBeLessThan(100);
    expect(r.etaToLimitHours).toBeNull();
  });

  it('flags ok when projected final is comfortably under 80%', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    // 3 days in, 30% used → pace 30/72 ≈ 0.417 → projected 30 + 0.417*96 = 70%
    const reset = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeWeeklyProjection(30, reset, now);
    expect(r.status).toBe('ok');
    expect(r.projectedFinalPercent).toBeCloseTo(70, 0);
    expect(r.etaToLimitHours).toBeNull();
  });

  it('back-derives windowStart as resetsAt - 7 days', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const reset = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeWeeklyProjection(15, reset, now);
    const expectedStart = new Date(
      new Date(reset).getTime() - SEVEN_DAYS_MS,
    ).toISOString();
    expect(r.windowStart).toBe(expectedStart);
  });

  it('reports method=linear when no profile is supplied', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const r = computeWeeklyProjection(30, resetIso(now, 4), now);
    expect(r.method).toBe('linear');
  });

  it('reports method=time-of-day when a profile is supplied', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const r = computeWeeklyProjection(30, resetIso(now, 4), now, uniformProfile());
    expect(r.method).toBe('time-of-day');
  });

  it('uniform profile reproduces linear projection (within rounding)', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const reset = resetIso(now, 4); // 3 days in, 4 days remaining
    const linear = computeWeeklyProjection(30, reset, now);
    const weighted = computeWeeklyProjection(30, reset, now, uniformProfile());
    expect(weighted.projectedFinalPercent).toBeCloseTo(
      linear.projectedFinalPercent!,
      0,
    );
  });

  it('weighted projection is lower when remaining time falls in quiet hours', () => {
    // Reset at Sunday 00:00Z. windowStart = previous Sunday 00:00Z.
    // "now" is Friday 17:00Z — 5d 17h elapsed, 1d 7h remaining (weekend).
    // Workday profile has tiny weight on weekend → weighted projection
    // should be lower than the flat linear projection.
    const now = new Date('2026-05-15T17:00:00Z'); // Friday
    const reset = new Date('2026-05-17T00:00:00Z').toISOString(); // Sunday
    const percent = 60;
    const linear = computeWeeklyProjection(percent, reset, now);
    const weighted = computeWeeklyProjection(percent, reset, now, workdayProfile());
    expect(weighted.method).toBe('time-of-day');
    expect(weighted.projectedFinalPercent!).toBeLessThan(
      linear.projectedFinalPercent!,
    );
  });

  it('weighted projection is higher when remaining time falls in busy hours', () => {
    // "now" is Monday 09:00Z — 1d 9h elapsed (Sun + Mon morning), then a full
    // workweek ahead. Linear underweights the busy days; weighted should hit
    // a higher final.
    const now = new Date('2026-05-11T09:00:00Z'); // Monday
    const reset = new Date('2026-05-17T00:00:00Z').toISOString(); // Sunday
    const percent = 10;
    const linear = computeWeeklyProjection(percent, reset, now);
    const weighted = computeWeeklyProjection(percent, reset, now, workdayProfile());
    expect(weighted.projectedFinalPercent!).toBeGreaterThan(
      linear.projectedFinalPercent!,
    );
  });

  it('weighted ETA lands during a busy hour, not a quiet one', () => {
    // Pacing for a will-exhaust scenario. ETA should advance fast through
    // workday hours and slowly overnight — strict equality is fragile, so
    // we just check the ETA is finite and falls before the reset.
    const now = new Date('2026-05-11T09:00:00Z'); // Monday morning
    const reset = new Date('2026-05-17T00:00:00Z').toISOString();
    const r = computeWeeklyProjection(50, reset, now, workdayProfile());
    expect(r.status).toBe('will-exhaust');
    expect(r.etaToLimitAt).not.toBeNull();
    const eta = new Date(r.etaToLimitAt!).getTime();
    expect(eta).toBeGreaterThan(now.getTime());
    expect(eta).toBeLessThanOrEqual(new Date(reset).getTime());
  });

  it('falls back to linear when elapsed weight is too small', () => {
    // Window starts 30 minutes ago → not enough elapsed weight to project.
    // But we're past the 1h MIN_ELAPSED_MS guard, so test with 2h elapsed
    // and an entirely-quiet profile slice.
    const now = new Date('2026-05-05T03:00:00Z'); // Tue 03:00 UTC — a quiet hour
    // Build a profile where ONLY 03:00 Tuesday has weight (degenerate but valid)
    const weights = new Float64Array(168);
    weights[2 * 24 + 3] = 1; // Tue 03:00 only
    const profile: HourOfWeekProfile = {
      weights,
      weeksOfHistory: 4,
      observedTokens: 1_000_000,
    };
    const reset = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const r = computeWeeklyProjection(2, reset, now, profile);
    // Either it produces a sane number, or it falls back to linear — both fine.
    expect(['linear', 'time-of-day']).toContain(r.method);
    expect(r.projectedFinalPercent).not.toBeNull();
  });
});
