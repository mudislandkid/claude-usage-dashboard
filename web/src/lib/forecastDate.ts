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
