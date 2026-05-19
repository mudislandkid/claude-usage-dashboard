import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';
import {
  todayLocalDate,
  isFutureOrToday,
  startOfLocalDayIso,
  endOfLocalDayIso,
  addDaysIso,
} from '../src/db/queries/forecastDay.js';

describe('forecast_snapshots schema', () => {
  it('creates the forecast_snapshots table with expected columns', () => {
    const db = openDb(':memory:');
    const cols = db
      .prepare("PRAGMA table_info(forecast_snapshots)")
      .all() as Array<{ name: string; type: string; pk: number }>;
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual(
      ['by_hour_json', 'computed_ts', 'local_date', 'total_chargeable', 'window_days'].sort(),
    );
    expect(cols.find((c) => c.name === 'local_date')!.pk).toBe(1);
    db.close();
  });
});

describe('forecastDay date helpers', () => {
  it('todayLocalDate returns YYYY-MM-DD format', () => {
    const today = todayLocalDate();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('isFutureOrToday compares dates correctly', () => {
    const today = todayLocalDate();
    expect(isFutureOrToday(today)).toBe(true);
    expect(isFutureOrToday(addDaysIso(today, 1))).toBe(true);
    expect(isFutureOrToday(addDaysIso(today, -1))).toBe(false);
  });

  it('startOfLocalDayIso returns an ISO timestamp at local midnight', () => {
    const iso = startOfLocalDayIso('2026-05-19');
    expect(new Date(iso).getHours()).toBe(0);
    expect(new Date(iso).getMinutes()).toBe(0);
    expect(new Date(iso).getSeconds()).toBe(0);
  });

  it('endOfLocalDayIso returns start of next day', () => {
    const start = new Date(startOfLocalDayIso('2026-05-19'));
    const end = new Date(endOfLocalDayIso('2026-05-19'));
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
  });

  it('addDaysIso advances by N days', () => {
    expect(addDaysIso('2026-05-19', 1)).toBe('2026-05-20');
    expect(addDaysIso('2026-05-19', -1)).toBe('2026-05-18');
    expect(addDaysIso('2026-05-31', 1)).toBe('2026-06-01');
  });
});
