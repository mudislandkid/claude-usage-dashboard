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
