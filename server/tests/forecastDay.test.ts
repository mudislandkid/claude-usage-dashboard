import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';
import {
  todayLocalDate,
  isFutureOrToday,
  startOfLocalDayIso,
  endOfLocalDayIso,
  addDaysIso,
  computeHistoricalForecast,
  getOrCreateSnapshot,
  readSnapshot,
} from '../src/db/queries/forecastDay.js';
import { insertTurn } from '../src/db/queries/turns.js';
import { upsertSession } from '../src/db/queries/sessions.js';

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

function seedSession(db: ReturnType<typeof openDb>) {
  upsertSession(db, {
    sessionId: 's1', projectPath: '/p', projectName: 'p',
    isSubagent: false, parentSessionId: null,
    firstTs: '2026-05-01T00:00:00Z', lastTs: '2026-05-19T00:00:00Z',
    primaryModel: null, entrypoint: null, version: null, gitBranch: null,
  });
}

describe('computeHistoricalForecast', () => {
  it('returns 24 hourly buckets', () => {
    const db = openDb(':memory:');
    seedSession(db);
    const out = computeHistoricalForecast(db, '2026-05-19', 30);
    expect(out.byHour).toHaveLength(24);
    expect(out.byHour.every((b, i) => b.hour === i)).toBe(true);
    db.close();
  });

  it('uses only history strictly before the target day', () => {
    const db = openDb(':memory:');
    seedSession(db);
    insertTurn(db, {
      sessionId: 's1', messageId: 'on-day', ts: new Date(2026, 4, 19, 10, 0, 0).toISOString(),
      model: 'claude-opus-4-7',
      inputTokens: 1_000_000, outputTokens: 0,
      cacheReadTokens: 0, cacheCreationTokens: 0,
      cacheCreation5m: 0, cacheCreation1h: 0,
      serviceTier: null, isSubagent: false, iterationsCount: 1,
    });
    const out = computeHistoricalForecast(db, '2026-05-19', 30);
    expect(out.totalForecast).toBe(0);
    db.close();
  });

  it('averages chargeable tokens across same-weekday-and-hour samples', () => {
    const db = openDb(':memory:');
    seedSession(db);
    // 2026-05-12 (Tue) and 2026-05-05 (Tue), hour 10 local
    // Use new Date(year, monthIdx, day, hour) so JS constructs in local time,
    // then .toISOString() gives UTC Z — SQLite reads as UTC and 'localtime' restores hour 10.
    const seeds = [
      { id: 't-2026-05-12', ts: new Date(2026, 4, 12, 10, 0, 0).toISOString() },
      { id: 't-2026-05-05', ts: new Date(2026, 4,  5, 10, 0, 0).toISOString() },
    ];
    for (const { id, ts } of seeds) {
      insertTurn(db, {
        sessionId: 's1', messageId: id, ts,
        model: 'claude-opus-4-7',
        inputTokens: 1000, outputTokens: 0,
        cacheReadTokens: 0, cacheCreationTokens: 500,
        cacheCreation5m: 0, cacheCreation1h: 0,
        serviceTier: null, isSubagent: false, iterationsCount: 1,
      });
    }
    const out = computeHistoricalForecast(db, '2026-05-19', 30);
    expect(out.byHour[10].expectedChargeable).toBe(1500);
    db.close();
  });
});

describe('forecast snapshots', () => {
  it('creates a snapshot on first call and returns it on subsequent calls', () => {
    const db = openDb(':memory:');
    seedSession(db);
    const first = getOrCreateSnapshot(db, todayLocalDate(), 30);
    expect(first.byHour).toHaveLength(24);
    expect(first.totalForecast).toBeGreaterThanOrEqual(0);

    const cached = readSnapshot(db, todayLocalDate());
    expect(cached).not.toBeNull();
    expect(cached!.byHour).toEqual(first.byHour);
    expect(cached!.totalForecast).toBe(first.totalForecast);
    db.close();
  });

  it('readSnapshot returns null when no row exists', () => {
    const db = openDb(':memory:');
    expect(readSnapshot(db, '2026-01-01')).toBeNull();
    db.close();
  });

  it('snapshot is not recomputed on second call', () => {
    const db = openDb(':memory:');
    seedSession(db);
    const date = todayLocalDate();

    // Manually insert a known snapshot
    db.prepare(
      `INSERT INTO forecast_snapshots (local_date, by_hour_json, total_chargeable, computed_ts, window_days)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      date,
      JSON.stringify(Array.from({ length: 24 }, (_, h) => ({ hour: h, expectedChargeable: 7777 }))),
      7777 * 24,
      new Date().toISOString(),
      30,
    );

    const out = getOrCreateSnapshot(db, date, 30);
    expect(out.byHour[5].expectedChargeable).toBe(7777);
    expect(out.totalForecast).toBe(7777 * 24);
    db.close();
  });
});
