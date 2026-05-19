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
  actualsForDay,
  forecastForDay,
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

describe('actualsForDay', () => {
  it('buckets chargeable tokens by local hour for the given date', () => {
    const db = openDb(':memory:');
    seedSession(db);
    // Two turns at local hour 10 on 2026-05-19, locale-portable timestamps
    insertTurn(db, {
      sessionId: 's1', messageId: 'a', ts: new Date(2026, 4, 19, 10, 30, 0).toISOString(),
      model: 'claude-opus-4-7',
      inputTokens: 200, outputTokens: 0,
      cacheReadTokens: 0, cacheCreationTokens: 100,
      cacheCreation5m: 0, cacheCreation1h: 0,
      serviceTier: null, isSubagent: false, iterationsCount: 1,
    });
    insertTurn(db, {
      sessionId: 's1', messageId: 'b', ts: new Date(2026, 4, 19, 10, 45, 0).toISOString(),
      model: 'claude-opus-4-7',
      inputTokens: 50, outputTokens: 0,
      cacheReadTokens: 0, cacheCreationTokens: 0,
      cacheCreation5m: 0, cacheCreation1h: 0,
      serviceTier: null, isSubagent: false, iterationsCount: 1,
    });
    const map = actualsForDay(db, '2026-05-19');
    expect(map.get(10)).toBe(350); // 200 + 100 + 50
    db.close();
  });
});

describe('forecastForDay (full response)', () => {
  it('marks past days as historical with full actuals', () => {
    const db = openDb(':memory:');
    seedSession(db);
    const yesterday = addDaysIso(todayLocalDate(), -1);
    const out = forecastForDay(db, yesterday, 30);
    expect(out.source).toBe('historical');
    expect(out.isPast).toBe(true);
    expect(out.isToday).toBe(false);
    expect(out.currentHour).toBeNull();
    expect(out.byHour).toHaveLength(24);
    // Past days: every hour has a non-null actual (zero or otherwise)
    expect(out.byHour.every((b) => b.actualChargeable !== null)).toBe(true);
    expect(out.totalActual).toBe(0);
    db.close();
  });

  it('marks today as snapshot, with actuals up to current hour', () => {
    const db = openDb(':memory:');
    seedSession(db);
    const out = forecastForDay(db, todayLocalDate(), 30);
    expect(out.source).toBe('snapshot');
    expect(out.isToday).toBe(true);
    expect(out.isPast).toBe(false);
    expect(out.currentHour).toBeGreaterThanOrEqual(0);
    expect(out.currentHour).toBeLessThanOrEqual(23);
    // Future hours are null, past/current hours are number
    const ch = out.currentHour!;
    for (let h = 0; h < 24; h++) {
      if (h <= ch) {
        expect(out.byHour[h].actualChargeable).not.toBeNull();
      } else {
        expect(out.byHour[h].actualChargeable).toBeNull();
      }
    }
    db.close();
  });

  it('marks tomorrow as snapshot, with all actuals null', () => {
    const db = openDb(':memory:');
    seedSession(db);
    const tomorrow = addDaysIso(todayLocalDate(), 1);
    const out = forecastForDay(db, tomorrow, 30);
    expect(out.source).toBe('snapshot');
    expect(out.isToday).toBe(false);
    expect(out.isPast).toBe(false);
    expect(out.currentHour).toBeNull();
    expect(out.byHour.every((b) => b.actualChargeable === null)).toBe(true);
    expect(out.totalActual).toBeNull();
    db.close();
  });
});
