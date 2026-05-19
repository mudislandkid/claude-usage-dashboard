# Day-Anchored Forecast with Actuals Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rolling 24h forecast with a day-anchored chart that overlays actual chargeable usage on top of the predicted curve, with `‹ TODAY ›` navigation across `[today − 7, today + 1]`.

**Architecture:** SQLite gets a new `forecast_snapshots` table holding `today`/`tomorrow` predictions, written lazily on first request. A new dated endpoint serves either a snapshot (today / future) or a freshly recomputed historical forecast (past), always merged with hourly actuals from `turns`. The frontend panel is split into a small orchestrator, a header day-navigator, and a focused SVG chart that renders forecast (blue) and actual (green) lines together.

**Tech Stack:** better-sqlite3, Fastify, Zod, Vitest (server) · React 18, TanStack Query, Vite, Vitest + happy-dom (web).

**Spec:** [docs/superpowers/specs/2026-05-19-forecast-day-actuals-design.md](../specs/2026-05-19-forecast-day-actuals-design.md)

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `server/src/db/schema.ts` | Modify | Add `forecast_snapshots` table to `SCHEMA_SQL` |
| `server/src/db/queries/forecastDay.ts` | Create | Snapshot lookup/insert, historical recompute, actuals merge, date helpers |
| `server/src/api/routes/insights.ts` | Modify | Add `GET /forecast/day` route |
| `server/tests/forecastDay.test.ts` | Create | Tests for the day-anchored forecast query module |
| `server/tests/forecastDayApi.test.ts` | Create | Tests for the new HTTP route |
| `web/src/lib/forecastDate.ts` | Create | `todayLocal`, `shiftDate`, `daysBetween`, `formatDayLabel` |
| `web/src/lib/forecastDate.test.ts` | Create | Tests for the date helpers |
| `web/src/hooks/useInsights.ts` | Modify | Add `useForecastDay(date)` hook and response type |
| `web/src/components/term-widgets/DayNavigator.tsx` | Create | `‹ LABEL ›` header control |
| `web/src/components/term-widgets/ForecastDayChart.tsx` | Create | Pure SVG renderer: two lines + now marker + tooltip |
| `web/src/components/term-widgets/ForecastPanel.tsx` | Create | Orchestrator (replaces `ForecastChart.tsx`) |
| `web/src/components/term-widgets/ForecastChart.tsx` | Delete | Replaced by `ForecastPanel.tsx` |
| `web/src/pages/Dashboard.tsx` | Modify | Update import path |

All TypeScript files target well under 500 lines (per project convention).

---

## Conventions

- Server tests use `import { describe, it, expect } from 'vitest'` and open `openDb(':memory:')` per test.
- Web tests use `import { describe, it, expect } from 'vitest'` with `happy-dom`.
- All new server queries use prepared statements and return plain `Array<{...}>` shapes.
- Use `strftime('%H', ts, 'localtime')` and `date(ts, 'localtime')` everywhere for hour/day bucketing. Never `getUTCHours()` in the new code.
- Commit messages follow the existing convention shown in recent log: `feat(scope): summary`, `test(scope): summary`, `refactor(scope): summary`.

---

## Task 1: Add `forecast_snapshots` table to schema

**Files:**
- Modify: `server/src/db/schema.ts`
- Test: `server/tests/forecastDay.test.ts` (create file with first table-exists test)

- [ ] **Step 1: Write the failing test**

Create `server/tests/forecastDay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- forecastDay`
Expected: FAIL — `forecast_snapshots` table does not exist.

- [ ] **Step 3: Add the table to `SCHEMA_SQL`**

In `server/src/db/schema.ts`, append to `SCHEMA_SQL` (before the closing backtick), after the `path_aliases` block:

```sql
CREATE TABLE IF NOT EXISTS forecast_snapshots (
  local_date       TEXT    PRIMARY KEY,
  by_hour_json     TEXT    NOT NULL,
  total_chargeable INTEGER NOT NULL,
  computed_ts      TEXT    NOT NULL,
  window_days      INTEGER NOT NULL DEFAULT 30
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- forecastDay`
Expected: PASS.

- [ ] **Step 5: Run the full server test suite to catch regressions**

Run: `cd server && npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/db/schema.ts server/tests/forecastDay.test.ts
git commit -m "feat(forecast): add forecast_snapshots table"
```

---

## Task 2: Date helpers in `forecastDay.ts`

Build the small server-side date utilities first; they're used by every other task in the server module.

**Files:**
- Create: `server/src/db/queries/forecastDay.ts`
- Modify: `server/tests/forecastDay.test.ts`

- [ ] **Step 1: Write failing tests for date helpers**

Append to `server/tests/forecastDay.test.ts`:

```ts
import {
  todayLocalDate,
  isFutureOrToday,
  startOfLocalDayIso,
  endOfLocalDayIso,
  addDaysIso,
} from '../src/db/queries/forecastDay.js';

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
    // Verify it parses back to a Date whose local hour is 0
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- forecastDay`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement date helpers**

Create `server/src/db/queries/forecastDay.ts`:

```ts
import type { DB } from '../connection.js';

/** Format a Date as YYYY-MM-DD in local time. */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today as YYYY-MM-DD in the server's local timezone. */
export function todayLocalDate(): string {
  return toLocalDateString(new Date());
}

/** True when `date` is today or in the future (local). */
export function isFutureOrToday(date: string): boolean {
  return date >= todayLocalDate();
}

/** ISO timestamp for local midnight at the start of the given date. */
export function startOfLocalDayIso(date: string): string {
  const [y, m, d] = date.split('-').map((s) => parseInt(s, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** ISO timestamp for the start of the day AFTER the given date. */
export function endOfLocalDayIso(date: string): string {
  const [y, m, d] = date.split('-').map((s) => parseInt(s, 10));
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString();
}

/** Advance a YYYY-MM-DD date by N days. */
export function addDaysIso(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d + delta);
  return toLocalDateString(dt);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npm test -- forecastDay`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/queries/forecastDay.ts server/tests/forecastDay.test.ts
git commit -m "feat(forecast): date helpers for local-day bucketing"
```

---

## Task 3: Historical forecast recompute

This is the path used for `date < today` — recompute from history that existed strictly before `00:00 of date`. Same weekday-avg shape as `forecastNext24h`, but parameterised.

**Files:**
- Modify: `server/src/db/queries/forecastDay.ts`
- Modify: `server/tests/forecastDay.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `server/tests/forecastDay.test.ts`:

```ts
import { computeHistoricalForecast } from '../src/db/queries/forecastDay.js';
import { insertTurn } from '../src/db/queries/turns.js';
import { upsertSession } from '../src/db/queries/sessions.js';

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
    // A turn ON the target day must be ignored
    insertTurn(db, {
      sessionId: 's1', messageId: 'on-day', ts: '2026-05-19T10:00:00Z',
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
    // Each contributes 1000 input + 500 creation = 1500 chargeable
    for (const day of ['2026-05-12', '2026-05-05']) {
      insertTurn(db, {
        sessionId: 's1', messageId: `t-${day}`, ts: `${day}T10:00:00`,
        model: 'claude-opus-4-7',
        inputTokens: 1000, outputTokens: 0,
        cacheReadTokens: 0, cacheCreationTokens: 500,
        cacheCreation5m: 0, cacheCreation1h: 0,
        serviceTier: null, isSubagent: false, iterationsCount: 1,
      });
    }
    // Forecast for 2026-05-19 (Tue), hour 10 should be 1500 (avg over 2 days)
    const out = computeHistoricalForecast(db, '2026-05-19', 30);
    expect(out.byHour[10].expectedChargeable).toBe(1500);
    db.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- forecastDay`
Expected: FAIL — `computeHistoricalForecast` not exported.

- [ ] **Step 3: Implement**

Append to `server/src/db/queries/forecastDay.ts`:

```ts
export interface ForecastDayPayload {
  byHour: Array<{ hour: number; expectedChargeable: number }>;
  totalForecast: number;
}

/**
 * Recompute the 24-hour forecast for a local date using history strictly
 * before `00:00 local` of that date. Used for past days (no snapshot).
 */
export function computeHistoricalForecast(
  db: DB,
  localDate: string,
  windowDays: number,
): ForecastDayPayload {
  const dayStartIso = startOfLocalDayIso(localDate);
  const cutoffIso = startOfLocalDayIso(addDaysIso(localDate, -windowDays));

  const rows = db
    .prepare(
      `SELECT
         CAST(strftime('%w', ts, 'localtime') AS INTEGER) AS weekday,
         CAST(strftime('%H', ts, 'localtime') AS INTEGER) AS hour,
         COALESCE(SUM(input_tokens + cache_creation_tokens), 0) AS chargeable,
         COUNT(DISTINCT date(ts, 'localtime')) AS day_samples
       FROM turns
       WHERE ts >= ? AND ts < ?
       GROUP BY weekday, hour`,
    )
    .all(cutoffIso, dayStartIso) as Array<{
      weekday: number;
      hour: number;
      chargeable: number;
      day_samples: number;
    }>;

  const map = new Map<string, { chargeable: number; samples: number }>();
  for (const r of rows) {
    map.set(`${r.weekday}-${r.hour}`, { chargeable: r.chargeable, samples: r.day_samples });
  }

  // Build a Date for the target day's local midnight to extract its weekday
  const [y, m, d] = localDate.split('-').map((s) => parseInt(s, 10));
  const targetDay = new Date(y, m - 1, d);
  const targetWeekday = targetDay.getDay();

  const byHour: Array<{ hour: number; expectedChargeable: number }> = [];
  let total = 0;
  for (let h = 0; h < 24; h++) {
    const cell = map.get(`${targetWeekday}-${h}`);
    const expected = cell && cell.samples > 0 ? cell.chargeable / cell.samples : 0;
    const rounded = Math.round(expected);
    byHour.push({ hour: h, expectedChargeable: rounded });
    total += rounded;
  }
  return { byHour, totalForecast: total };
}
```

- [ ] **Step 4: Run tests**

Run: `cd server && npm test -- forecastDay`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/queries/forecastDay.ts server/tests/forecastDay.test.ts
git commit -m "feat(forecast): historical recompute for past days"
```

---

## Task 4: Snapshot lookup/insert path

**Files:**
- Modify: `server/src/db/queries/forecastDay.ts`
- Modify: `server/tests/forecastDay.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `server/tests/forecastDay.test.ts`:

```ts
import { getOrCreateSnapshot, readSnapshot } from '../src/db/queries/forecastDay.js';

describe('forecast snapshots', () => {
  it('creates a snapshot on first call and returns it on subsequent calls', () => {
    const db = openDb(':memory:');
    seedSession(db);
    const first = getOrCreateSnapshot(db, todayLocalDate(), 30);
    expect(first.byHour).toHaveLength(24);
    expect(first.totalForecast).toBeGreaterThanOrEqual(0);

    // Second call should be a pure read — write a marker that
    // computeHistoricalForecast would never produce, then verify
    // that getOrCreateSnapshot returns the stored row unchanged.
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- forecastDay`
Expected: FAIL — `getOrCreateSnapshot` and `readSnapshot` not exported.

- [ ] **Step 3: Implement**

Append to `server/src/db/queries/forecastDay.ts`:

```ts
export function readSnapshot(db: DB, localDate: string): ForecastDayPayload | null {
  const row = db
    .prepare(
      `SELECT by_hour_json, total_chargeable
       FROM forecast_snapshots
       WHERE local_date = ?`,
    )
    .get(localDate) as { by_hour_json: string; total_chargeable: number } | undefined;
  if (!row) return null;
  return {
    byHour: JSON.parse(row.by_hour_json) as Array<{ hour: number; expectedChargeable: number }>,
    totalForecast: row.total_chargeable,
  };
}

/**
 * For today/future dates: return the stored snapshot, computing and
 * persisting one if absent.
 */
export function getOrCreateSnapshot(
  db: DB,
  localDate: string,
  windowDays: number,
): ForecastDayPayload {
  const cached = readSnapshot(db, localDate);
  if (cached) return cached;

  const computed = computeHistoricalForecast(db, localDate, windowDays);
  db.prepare(
    `INSERT OR REPLACE INTO forecast_snapshots
       (local_date, by_hour_json, total_chargeable, computed_ts, window_days)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    localDate,
    JSON.stringify(computed.byHour),
    computed.totalForecast,
    new Date().toISOString(),
    windowDays,
  );
  return computed;
}
```

- [ ] **Step 4: Run tests**

Run: `cd server && npm test -- forecastDay`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/queries/forecastDay.ts server/tests/forecastDay.test.ts
git commit -m "feat(forecast): lazy snapshot for today/future days"
```

---

## Task 5: Actuals query + assembled response

**Files:**
- Modify: `server/src/db/queries/forecastDay.ts`
- Modify: `server/tests/forecastDay.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `server/tests/forecastDay.test.ts`:

```ts
import { actualsForDay, forecastForDay } from '../src/db/queries/forecastDay.js';

describe('actualsForDay', () => {
  it('buckets chargeable tokens by local hour for the given date', () => {
    const db = openDb(':memory:');
    seedSession(db);
    insertTurn(db, {
      sessionId: 's1', messageId: 'a', ts: '2026-05-19T10:30:00',
      model: 'claude-opus-4-7',
      inputTokens: 200, outputTokens: 0,
      cacheReadTokens: 0, cacheCreationTokens: 100,
      cacheCreation5m: 0, cacheCreation1h: 0,
      serviceTier: null, isSubagent: false, iterationsCount: 1,
    });
    insertTurn(db, {
      sessionId: 's1', messageId: 'b', ts: '2026-05-19T10:45:00',
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- forecastDay`
Expected: FAIL — `actualsForDay` / `forecastForDay` not exported.

- [ ] **Step 3: Implement**

Append to `server/src/db/queries/forecastDay.ts`:

```ts
export function actualsForDay(db: DB, localDate: string): Map<number, number> {
  const rows = db
    .prepare(
      `SELECT
         CAST(strftime('%H', ts, 'localtime') AS INTEGER) AS hour,
         COALESCE(SUM(input_tokens + cache_creation_tokens), 0) AS chargeable
       FROM turns
       WHERE date(ts, 'localtime') = ?
       GROUP BY hour`,
    )
    .all(localDate) as Array<{ hour: number; chargeable: number }>;
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.hour, r.chargeable);
  return map;
}

export interface ForecastDayResponse {
  date: string;
  source: 'snapshot' | 'historical';
  byHour: Array<{
    hour: number;
    expectedChargeable: number;
    actualChargeable: number | null;
  }>;
  totalForecast: number;
  totalActual: number | null;
  isToday: boolean;
  isPast: boolean;
  currentHour: number | null;
}

export function forecastForDay(
  db: DB,
  localDate: string,
  windowDays: number,
): ForecastDayResponse {
  const today = todayLocalDate();
  const isToday = localDate === today;
  const isPast = localDate < today;

  const base = isFutureOrToday(localDate)
    ? getOrCreateSnapshot(db, localDate, windowDays)
    : computeHistoricalForecast(db, localDate, windowDays);
  const source: 'snapshot' | 'historical' = isFutureOrToday(localDate)
    ? 'snapshot'
    : 'historical';

  const currentHour = isToday ? new Date().getHours() : null;
  const isFuture = !isPast && !isToday; // i.e., tomorrow

  const actuals = isFuture ? new Map<number, number>() : actualsForDay(db, localDate);

  let totalActual: number | null = isFuture ? null : 0;
  const byHour = base.byHour.map((b) => {
    let actualChargeable: number | null;
    if (isFuture) {
      actualChargeable = null;
    } else if (isPast) {
      actualChargeable = actuals.get(b.hour) ?? 0;
    } else {
      // today: actual for hours <= currentHour, null for future hours
      actualChargeable = b.hour <= (currentHour ?? -1) ? (actuals.get(b.hour) ?? 0) : null;
    }
    if (actualChargeable !== null && totalActual !== null) {
      totalActual += actualChargeable;
    }
    return { ...b, actualChargeable };
  });

  return {
    date: localDate,
    source,
    byHour,
    totalForecast: base.totalForecast,
    totalActual,
    isToday,
    isPast,
    currentHour,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd server && npm test -- forecastDay`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/queries/forecastDay.ts server/tests/forecastDay.test.ts
git commit -m "feat(forecast): assemble day response with actuals overlay"
```

---

## Task 6: HTTP route `GET /forecast/day`

**Files:**
- Modify: `server/src/api/routes/insights.ts`
- Create: `server/tests/forecastDayApi.test.ts`

- [ ] **Step 1: Write the failing API test**

Create `server/tests/forecastDayApi.test.ts`. Look at how `server/tests/api.test.ts` builds the Fastify app and reuse the same helper (read that file first to mirror the setup):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { openDb } from '../src/db/connection.js';
import { insightsRoutes } from '../src/api/routes/insights.js';
import type { Database } from 'better-sqlite3';

function buildApp(db: Database) {
  const app = Fastify();
  app.register((scope, _, done) => {
    insightsRoutes(scope, { ctx: { db, dataRoot: '/tmp' } as any });
    done();
  });
  return app;
}

describe('GET /forecast/day', () => {
  let db: Database;
  beforeEach(() => { db = openDb(':memory:'); });
  afterEach(() => { db.close(); });

  it('returns todays forecast when no date is given', async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: 'GET', url: '/forecast/day' });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.byHour).toHaveLength(24);
    expect(json.isToday).toBe(true);
    expect(json.source).toBe('snapshot');
    await app.close();
  });

  it('accepts explicit YYYY-MM-DD date', async () => {
    const app = buildApp(db);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const res = await app.inject({ method: 'GET', url: `/forecast/day?date=${todayStr}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().date).toBe(todayStr);
    await app.close();
  });

  it('rejects dates outside [today-7, today+1]', async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: 'GET', url: '/forecast/day?date=2020-01-01' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/range/i);
    await app.close();
  });

  it('rejects malformed date', async () => {
    const app = buildApp(db);
    const res = await app.inject({ method: 'GET', url: '/forecast/day?date=not-a-date' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- forecastDayApi`
Expected: FAIL — route returns 404.

- [ ] **Step 3: Add the route**

Edit `server/src/api/routes/insights.ts`. Add the import near the top with the other query imports:

```ts
import {
  forecastForDay,
  todayLocalDate,
  addDaysIso,
} from '../../db/queries/forecastDay.js';
```

And add a route handler inside `insightsRoutes`, after the existing `/forecast` route:

```ts
const DayQ = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().min(1).max(365).default(30),
});

app.get('/forecast/day', async (req, reply) => {
  const parsed = DayQ.safeParse(req.query);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid query parameters' });
  }
  const today = todayLocalDate();
  const date = parsed.data.date ?? today;
  const minDate = addDaysIso(today, -7);
  const maxDate = addDaysIso(today, 1);
  if (date < minDate || date > maxDate) {
    return reply.code(400).send({ error: 'date out of range' });
  }
  return forecastForDay(opts.ctx.db, date, parsed.data.days);
});
```

- [ ] **Step 4: Run tests**

Run: `cd server && npm test -- forecastDayApi`
Expected: PASS.

- [ ] **Step 5: Run full server suite**

Run: `cd server && npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/api/routes/insights.ts server/tests/forecastDayApi.test.ts
git commit -m "feat(forecast): GET /forecast/day endpoint"
```

---

## Task 7: Web date helpers

**Files:**
- Create: `web/src/lib/forecastDate.ts`
- Create: `web/src/lib/forecastDate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `web/src/lib/forecastDate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  todayLocal,
  shiftDate,
  daysBetween,
  formatDayLabel,
} from './forecastDate';

describe('forecastDate', () => {
  it('todayLocal returns YYYY-MM-DD', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('shiftDate advances by N days', () => {
    expect(shiftDate('2026-05-19', 1)).toBe('2026-05-20');
    expect(shiftDate('2026-05-19', -1)).toBe('2026-05-18');
    expect(shiftDate('2026-05-31', 1)).toBe('2026-06-01');
  });

  it('daysBetween signed difference in days', () => {
    expect(daysBetween('2026-05-19', '2026-05-19')).toBe(0);
    expect(daysBetween('2026-05-18', '2026-05-19')).toBe(1);
    expect(daysBetween('2026-05-19', '2026-05-18')).toBe(-1);
  });

  it('formatDayLabel handles today/yesterday/tomorrow', () => {
    const today = todayLocal();
    expect(formatDayLabel(today, today)).toBe('TODAY');
    expect(formatDayLabel(shiftDate(today, -1), today)).toBe('YESTERDAY');
    expect(formatDayLabel(shiftDate(today, 1), today)).toBe('TOMORROW');
  });

  it('formatDayLabel produces uppercase DDD DD MMM for other dates', () => {
    // 2026-05-12 is a Tuesday
    expect(formatDayLabel('2026-05-12', '2026-05-19')).toBe('TUE 12 MAY');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- forecastDate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `web/src/lib/forecastDate.ts`:

```ts
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map((s) => parseInt(s, 10));
  return new Date(y, m - 1, d);
}

export function todayLocal(): string {
  return toLocalDateString(new Date());
}

export function shiftDate(date: string, delta: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + delta);
  return toLocalDateString(d);
}

/** Signed difference: target - reference, in whole days. */
export function daysBetween(reference: string, target: string): number {
  const a = parseDate(reference);
  const b = parseDate(target);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatDayLabel(date: string, today: string): string {
  const delta = daysBetween(today, date);
  if (delta === 0) return 'TODAY';
  if (delta === -1) return 'YESTERDAY';
  if (delta === 1) return 'TOMORROW';
  const d = parseDate(date);
  return `${DOW[d.getDay()]} ${pad2(d.getDate())} ${MON[d.getMonth()]}`;
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npm test -- forecastDate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/forecastDate.ts web/src/lib/forecastDate.test.ts
git commit -m "feat(forecast): web date helpers"
```

---

## Task 8: `useForecastDay` hook

**Files:**
- Modify: `web/src/hooks/useInsights.ts`

- [ ] **Step 1: Add the response type and hook**

Append to `web/src/hooks/useInsights.ts`:

```ts
export interface ForecastDayResponse {
  date: string;
  source: 'snapshot' | 'historical';
  byHour: Array<{
    hour: number;
    expectedChargeable: number;
    actualChargeable: number | null;
  }>;
  totalForecast: number;
  totalActual: number | null;
  isToday: boolean;
  isPast: boolean;
  currentHour: number | null;
}

export function useForecastDay(date: string, days = 30) {
  return useQuery({
    queryKey: ['forecastDay', date, days],
    queryFn: () => api<ForecastDayResponse>(`/forecast/day?date=${date}&days=${days}`),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Run the web type check**

Run: `cd web && npm run typecheck`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useInsights.ts
git commit -m "feat(forecast): useForecastDay hook"
```

---

## Task 9: `DayNavigator` component

A small header control with two arrow buttons and a label, plus disable logic.

**Files:**
- Create: `web/src/components/term-widgets/DayNavigator.tsx`

- [ ] **Step 1: Implement (no unit test — verified via the panel integration test in Task 11)**

Create `web/src/components/term-widgets/DayNavigator.tsx`:

```tsx
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { formatDayLabel } from '@/lib/forecastDate';

interface Props {
  date: string;
  today: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onShift: (delta: number) => void;
  onReset: () => void;
}

export function DayNavigator({ date, today, canGoBack, canGoForward, onShift, onReset }: Props) {
  const label = formatDayLabel(date, today);
  const btnStyle = (enabled: boolean): React.CSSProperties => ({
    background: 'transparent',
    border: 'none',
    color: enabled ? TT.text : TT.textDim,
    cursor: enabled ? 'pointer' : 'default',
    fontFamily: TT_MONO,
    fontSize: 12,
    padding: '0 6px',
    letterSpacing: '0.1em',
  });
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: TT_MONO,
        fontSize: 10,
        color: TT.textMute,
        letterSpacing: '0.06em',
      }}
    >
      <button
        type="button"
        aria-label="Previous day"
        disabled={!canGoBack}
        onClick={() => canGoBack && onShift(-1)}
        style={btnStyle(canGoBack)}
      >
        ‹
      </button>
      <button
        type="button"
        onClick={onReset}
        aria-label="Reset to today"
        style={{ ...btnStyle(true), color: TT.text, minWidth: 88, textAlign: 'center' }}
      >
        {label}
      </button>
      <button
        type="button"
        aria-label="Next day"
        disabled={!canGoForward}
        onClick={() => canGoForward && onShift(1)}
        style={btnStyle(canGoForward)}
      >
        ›
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Run web typecheck**

Run: `cd web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/term-widgets/DayNavigator.tsx
git commit -m "feat(forecast): day navigator header control"
```

---

## Task 10: `ForecastDayChart` SVG component

The pure renderer. No state, no fetching — takes data, draws two lines.

**Files:**
- Create: `web/src/components/term-widgets/ForecastDayChart.tsx`

- [ ] **Step 1: Implement**

Create `web/src/components/term-widgets/ForecastDayChart.tsx`:

```tsx
import { useState } from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { formatTokens } from '@/lib/format';
import type { ForecastDayResponse } from '@/hooks/useInsights';

const W = 600;
const H = 200;

interface Props {
  data: ForecastDayResponse;
}

export function ForecastDayChart({ data }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const forecast = data.byHour.map((b) => b.expectedChargeable);
  const actuals = data.byHour.map((b) => b.actualChargeable);

  const maxVal = Math.max(
    ...forecast,
    ...actuals.map((v) => (v ?? 0)),
    1,
  );

  const xFor = (i: number) => (i * W) / 23;
  const yFor = (v: number) => H - (v / maxVal) * (H - 30) - 15;

  const forecastPts = forecast.map((v, i) => [xFor(i), yFor(v)] as const);
  const forecastD = forecastPts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))
    .join(' ');
  const forecastFill = forecastD + ` L ${W} ${H - 5} L 0 ${H - 5} Z`;

  // Build actual path only over consecutive non-null hours
  const actualSegments: Array<Array<readonly [number, number]>> = [];
  let current: Array<readonly [number, number]> = [];
  for (let i = 0; i < 24; i++) {
    const v = actuals[i];
    if (v === null) {
      if (current.length) actualSegments.push(current);
      current = [];
    } else {
      current.push([xFor(i), yFor(v)] as const);
    }
  }
  if (current.length) actualSegments.push(current);
  const actualPaths = actualSegments.map((seg) =>
    seg.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '),
  );
  // Build a single filled area beneath the actual line if we have any segment
  let actualFill: string | null = null;
  if (actualSegments.length && actualSegments[0].length > 1) {
    const all = actualSegments.flat();
    const first = all[0];
    const last = all[all.length - 1];
    actualFill =
      all.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') +
      ` L ${last[0]} ${H - 5} L ${first[0]} ${H - 5} Z`;
  }

  const tickHours = [0, 6, 12, 18, 23];
  const nowX = data.currentHour !== null ? xFor(data.currentHour) : null;
  const hoverF = hover !== null ? forecast[hover] : 0;
  const hoverA = hover !== null ? actuals[hover] : null;
  const hoverPt = hover !== null ? forecastPts[hover] : null;

  return (
    <div>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const i = Math.max(0, Math.min(23, Math.round(x / (W / 23))));
          setHover(i);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TT.blue} stopOpacity="0.25" />
            <stop offset="100%" stopColor={TT.blue} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TT.green} stopOpacity="0.25" />
            <stop offset="100%" stopColor={TT.green} stopOpacity="0" />
          </linearGradient>
        </defs>

        {Array.from({ length: 5 }, (_, i) => (
          <line
            key={i}
            y1={(i / 4) * (H - 15)}
            y2={(i / 4) * (H - 15)}
            x1={0}
            x2={W}
            stroke={TT.grid}
          />
        ))}

        <path d={forecastFill} fill="url(#fcGrad)" />
        <path d={forecastD} fill="none" stroke={TT.blue} strokeWidth={1.4} />

        {actualFill && <path d={actualFill} fill="url(#acGrad)" />}
        {actualPaths.map((d, i) => (
          <path key={`a${i}`} d={d} fill="none" stroke={TT.green} strokeWidth={1.6} />
        ))}

        {forecastPts.map((p, i) => (
          <circle
            key={`fp${i}`}
            cx={p[0]}
            cy={p[1]}
            r={hover === i ? 3 : 1.5}
            fill={hover === i ? TT.cyan : TT.blue}
            style={{ transition: 'r 120ms' }}
          />
        ))}
        {actuals.map((v, i) =>
          v === null ? null : (
            <circle
              key={`ap${i}`}
              cx={xFor(i)}
              cy={yFor(v)}
              r={hover === i ? 3 : 1.5}
              fill={hover === i ? TT.greenBright : TT.green}
              style={{ transition: 'r 120ms' }}
            />
          ),
        )}

        {nowX !== null && (
          <g>
            <line
              x1={nowX}
              x2={nowX}
              y1={0}
              y2={H - 5}
              stroke={TT.textMute}
              strokeOpacity={0.45}
              strokeDasharray="3 3"
            />
            <text
              x={nowX + 4}
              y={11}
              fontFamily={TT_MONO}
              fontSize={9}
              fill={TT.textMute}
            >
              NOW
            </text>
          </g>
        )}

        {hoverPt && (
          <g>
            <line
              x1={hoverPt[0]}
              x2={hoverPt[0]}
              y1={0}
              y2={H - 5}
              stroke={TT.cyan}
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
            <rect
              x={hoverPt[0] + 6 > W - 120 ? hoverPt[0] - 120 : hoverPt[0] + 6}
              y={Math.max(0, hoverPt[1] - 42)}
              width={114}
              height={hoverA !== null ? 38 : 26}
              fill={TT.bgAlt}
              stroke={TT.borderHi}
            />
            <text
              x={hoverPt[0] + 6 > W - 120 ? hoverPt[0] - 114 : hoverPt[0] + 12}
              y={Math.max(0, hoverPt[1] - 42) + 12}
              fontFamily={TT_MONO}
              fontSize={9}
              fill={TT.textMute}
            >
              {String(hover).padStart(2, '0')}:00
            </text>
            <text
              x={hoverPt[0] + 6 > W - 120 ? hoverPt[0] - 114 : hoverPt[0] + 12}
              y={Math.max(0, hoverPt[1] - 42) + 22}
              fontFamily={TT_MONO}
              fontSize={10}
              fill={TT.blue}
            >
              fcst {formatTokens(hoverF)}
            </text>
            {hoverA !== null && (
              <text
                x={hoverPt[0] + 6 > W - 120 ? hoverPt[0] - 114 : hoverPt[0] + 12}
                y={Math.max(0, hoverPt[1] - 42) + 33}
                fontFamily={TT_MONO}
                fontSize={10}
                fill={TT.green}
              >
                act  {formatTokens(hoverA)}
              </text>
            )}
          </g>
        )}
      </svg>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: TT_MONO,
          fontSize: 9,
          color: TT.textDim,
          marginTop: 4,
        }}
      >
        {tickHours.map((h) => (
          <span key={h}>{String(h).padStart(2, '0')}:00</span>
        ))}
      </div>

      {data.totalActual !== null && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            fontFamily: TT_MONO,
            fontSize: 10,
            color: TT.textMute,
            marginTop: 8,
          }}
        >
          <span>
            <span style={{ color: TT.blue }}>■</span> forecast
          </span>
          <span>
            <span style={{ color: TT.green }}>■</span> actual
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run web typecheck**

Run: `cd web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/term-widgets/ForecastDayChart.tsx
git commit -m "feat(forecast): SVG renderer for forecast + actuals"
```

---

## Task 11: `ForecastPanel` orchestrator (replace `ForecastChart.tsx`)

**Files:**
- Create: `web/src/components/term-widgets/ForecastPanel.tsx`
- Delete: `web/src/components/term-widgets/ForecastChart.tsx`
- Modify: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: Implement the new panel**

Create `web/src/components/term-widgets/ForecastPanel.tsx`:

```tsx
import { useState, useMemo } from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { useForecastDay } from '@/hooks/useInsights';
import { formatTokens } from '@/lib/format';
import { todayLocal, shiftDate, daysBetween } from '@/lib/forecastDate';
import { DayNavigator } from './DayNavigator';
import { ForecastDayChart } from './ForecastDayChart';

export function ForecastPanel() {
  // null = "follow today"; explicit string = pinned date
  const [pinned, setPinned] = useState<string | null>(null);
  const today = todayLocal();
  const date = pinned ?? today;
  const { data, isLoading } = useForecastDay(date);

  const canGoBack = useMemo(() => daysBetween(date, today) < 7, [date, today]);
  const canGoForward = useMemo(() => daysBetween(today, date) < 1, [date, today]);

  const shift = (delta: number) => {
    const next = shiftDate(date, delta);
    setPinned(next === today ? null : next);
  };

  const action = (
    <DayNavigator
      date={date}
      today={today}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onShift={shift}
      onReset={() => setPinned(null)}
    />
  );

  if (!data) {
    return (
      <TPanel title="FORECAST_24H" sub="// weekday-avg" action={action} accent={TT.blue}>
        {isLoading ? 'Loading…' : <span style={{ color: TT.textMute }}>No data.</span>}
      </TPanel>
    );
  }

  // Headline number + sub-line per view (today/tomorrow/past)
  let headline: { value: number; color: string };
  let subLine: string;
  if (data.isPast && data.totalActual !== null) {
    const variance =
      data.totalForecast > 0
        ? Math.round(((data.totalActual - data.totalForecast) / data.totalForecast) * 100)
        : 0;
    const sign = variance > 0 ? '+' : '';
    headline = { value: data.totalActual, color: TT.green };
    subLine = `actual · vs ${formatTokens(data.totalForecast)} forecast (${sign}${variance}%)`;
  } else if (data.isToday && data.totalActual !== null) {
    headline = { value: data.totalForecast, color: TT.blue };
    subLine = `${formatTokens(data.totalActual)} actual so far · ${formatTokens(data.totalForecast)} forecast`;
  } else {
    headline = { value: data.totalForecast, color: TT.blue };
    subLine = `chargeable forecast`;
  }

  const sub = data.isPast
    ? '// recomputed from history'
    : data.isToday
      ? '// snapshot · live actuals'
      : '// weekday-avg projection';

  return (
    <TPanel title="FORECAST_24H" sub={sub} action={action} accent={TT.blue}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <span
            style={{
              fontSize: 38,
              color: headline.color,
              fontWeight: 500,
              fontFamily: TT_MONO,
              lineHeight: 1,
            }}
          >
            {formatTokens(headline.value)}
          </span>
          <span style={{ fontSize: 11, color: TT.textMute, fontFamily: TT_MONO }}>
            {subLine}
          </span>
        </div>
        <ForecastDayChart data={data} />
      </div>
    </TPanel>
  );
}
```

- [ ] **Step 2: Update Dashboard import**

Edit `web/src/pages/Dashboard.tsx`. Change:

```ts
import { ForecastPanel } from '@/components/term-widgets/ForecastChart';
```

to:

```ts
import { ForecastPanel } from '@/components/term-widgets/ForecastPanel';
```

- [ ] **Step 3: Delete the old `ForecastChart.tsx`**

```bash
rm web/src/components/term-widgets/ForecastChart.tsx
```

- [ ] **Step 4: Run typecheck and tests**

Run: `cd web && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Verify build succeeds**

Run: `cd web && npm run build`
Expected: PASS — no type errors, bundle produced.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/term-widgets/ForecastPanel.tsx web/src/pages/Dashboard.tsx
git add -u  # picks up the deletion of ForecastChart.tsx
git commit -m "feat(forecast): day-anchored panel with actuals overlay"
```

---

## Task 12: Manual verification

This is a UI feature; we verify it in the browser before considering the work done. Type checks and tests verify code correctness, not visual correctness.

- [ ] **Step 1: Build the server**

Run: `cd server && npm run build`
Expected: PASS.

- [ ] **Step 2: Ask the user to start (or restart) the dev server**

Per repo convention, the user starts the dev server. Pause here. Ask the user:

> "Both builds passed. Please start the dev server and open the dashboard. Verify the FORECAST_24H panel:
>
> 1. Defaults to TODAY with both blue forecast line and green actual line up to the current hour.
> 2. Clicking ‹ navigates to YESTERDAY, then prior weekdays (TUE 18 MAY etc.), up to 7 days back.
> 3. Clicking › from TODAY goes to TOMORROW — forecast only, no green line, no NOW marker.
> 4. Clicking the date label resets to TODAY.
> 5. Arrows disable at the bounds (7 days back, 1 day forward).
> 6. Hovering shows both forecast and actual values in the tooltip.
> 7. Past-day headline is green (actual); today/tomorrow headline is blue (forecast).
>
> Let me know if anything looks off — colors, spacing, label format, snapshot creation lag, etc."

- [ ] **Step 3: Address feedback if any, otherwise close out**

Any UI tweak goes into a follow-up commit in the same file (`ForecastPanel.tsx` / `ForecastDayChart.tsx` / `DayNavigator.tsx`). No new tasks needed.

---

## Self-Review Notes

- **Spec coverage:** Snapshot table (Task 1), snapshot path (Task 4), historical path (Task 3), actuals (Task 5), dated endpoint with range validation (Task 6), web date helpers + label rules (Task 7), hook (Task 8), navigator UI in panel header action slot (Task 9), two-line SVG with now-marker and legend (Task 10), orchestrator with today/past/tomorrow headline rules and dated subline (Task 11), follow-today vs pinned-date state (Task 11), browser verification of all visual behaviors (Task 12). ✓
- **Placeholder scan:** Every step has concrete code or commands. No "TBD" / "similar to" references. ✓
- **Type consistency:** `ForecastDayResponse` shape is identical in `server/src/db/queries/forecastDay.ts`, the HTTP route (returned verbatim), and `web/src/hooks/useInsights.ts`. The web `formatDayLabel`, `shiftDate`, `daysBetween`, `todayLocal` names match between the helpers, navigator, and panel. ✓
- **One subtle thing:** Task 7's `formatDayLabel` test for `'TUE 12 MAY'` assumes the local `Date` parsed from `'2026-05-12'` evaluates to Tuesday in the test environment. May 12 2026 *is* a Tuesday (the spec was written on 2026-05-19, also a Tuesday, with 7-day spacing). ✓
