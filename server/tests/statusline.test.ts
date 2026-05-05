import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readStatuslineSidecar } from '../src/lib/statusline.js';

describe('readStatuslineSidecar', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `cud-statusline-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  });

  it('returns null when sidecar is missing', () => {
    expect(readStatuslineSidecar(new Date(), tmpFile)).toBeNull();
  });

  it('returns null when sidecar contains invalid JSON', () => {
    fs.writeFileSync(tmpFile, '{not json');
    expect(readStatuslineSidecar(new Date(), tmpFile)).toBeNull();
  });

  it('returns null when rate_limits is absent (early in session)', () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        model: { id: 'claude-opus-4-7', display_name: 'Opus 4.7' },
        context_window: { used_percentage: 12 },
      }),
    );
    expect(readStatuslineSidecar(new Date(), tmpFile)).toBeNull();
  });

  it('parses 5h and 7d rate limits with epoch reset times', () => {
    const resetEpoch = 1738425600;
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        rate_limits: {
          five_hour: { used_percentage: 23.5, resets_at: resetEpoch },
          seven_day: { used_percentage: 41.2, resets_at: resetEpoch + 86400 },
        },
      }),
    );
    const snap = readStatuslineSidecar(new Date(), tmpFile);
    expect(snap).not.toBeNull();
    expect(snap!.fiveHourPercent).toBe(23.5);
    expect(snap!.fiveHourResetsAt).toBe(new Date(resetEpoch * 1000).toISOString());
    expect(snap!.sevenDayPercent).toBe(41.2);
    expect(snap!.sevenDayResetsAt).toBe(new Date((resetEpoch + 86400) * 1000).toISOString());
    expect(snap!.ageSeconds).toBeGreaterThanOrEqual(0);
  });

  it('handles partial rate_limits (only five_hour present)', () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        rate_limits: {
          five_hour: { used_percentage: 10, resets_at: 1738425600 },
        },
      }),
    );
    const snap = readStatuslineSidecar(new Date(), tmpFile);
    expect(snap!.fiveHourPercent).toBe(10);
    expect(snap!.sevenDayPercent).toBeNull();
    expect(snap!.sevenDayResetsAt).toBeNull();
  });

  it('reports ageSeconds against provided now', () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        rate_limits: { five_hour: { used_percentage: 5, resets_at: 1738425600 } },
      }),
    );
    const stat = fs.statSync(tmpFile);
    const futureNow = new Date(stat.mtimeMs + 30_000);
    const snap = readStatuslineSidecar(futureNow, tmpFile);
    expect(snap!.ageSeconds).toBeGreaterThanOrEqual(29);
    expect(snap!.ageSeconds).toBeLessThanOrEqual(31);
  });
});
