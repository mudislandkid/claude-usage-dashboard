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
  const parts = date.split('-').map((s) => parseInt(s, 10));
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** ISO timestamp for the start of the day AFTER the given date. */
export function endOfLocalDayIso(date: string): string {
  const parts = date.split('-').map((s) => parseInt(s, 10));
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString();
}

/** Advance a YYYY-MM-DD date by N days. */
export function addDaysIso(date: string, delta: number): string {
  const parts = date.split('-').map((s) => parseInt(s, 10));
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(y, m - 1, d + delta);
  return toLocalDateString(dt);
}

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

  const parts = localDate.split('-').map((s) => parseInt(s, 10));
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
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
  const isFuture = !isPast && !isToday; // i.e., tomorrow or beyond

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
