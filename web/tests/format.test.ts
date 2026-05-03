import { describe, it, expect } from 'vitest';
import { formatTokens, formatPercent, formatRelative, formatDuration } from '../src/lib/format';

describe('format', () => {
  it('tokens', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(2_500_000)).toBe('2.50M');
  });

  it('percent', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.123, 1)).toBe('12.3%');
  });

  it('duration', () => {
    expect(formatDuration(0.5)).toBe('<1 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(125)).toBe('2h 5m');
  });

  it('relative', () => {
    expect(formatRelative(null)).toBe('—');
    expect(formatRelative(new Date().toISOString())).toBe('just now');
  });
});
