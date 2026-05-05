import { describe, it, expect } from 'vitest';
import { computeWeeklyProjection } from '../src/lib/weeklyProjection.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function resetIso(now: Date, daysFromNow: number): string {
  return new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
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
});
