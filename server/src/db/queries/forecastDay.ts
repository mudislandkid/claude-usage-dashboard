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
