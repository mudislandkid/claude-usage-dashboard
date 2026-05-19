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
