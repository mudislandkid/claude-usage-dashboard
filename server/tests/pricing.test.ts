import { describe, it, expect } from 'vitest';
import {
  parseModelVersion,
  resolveRates,
  dollarize,
  PRICING,
  LEGACY_OPUS_RATES,
  FAST_OPUS_4_8_RATES,
  FAST_OPUS_4_6_4_7_RATES,
  detectFastMode,
  emptyBuckets,
} from '../src/pricing.js';

describe('parseModelVersion', () => {
  it('parses Claude 4+ ids', () => {
    expect(parseModelVersion('claude-opus-4-8')).toEqual({ family: 'opus', major: 4, minor: 8 });
    expect(parseModelVersion('claude-opus-4-7')).toEqual({ family: 'opus', major: 4, minor: 7 });
    expect(parseModelVersion('claude-sonnet-4-6')).toEqual({ family: 'sonnet', major: 4, minor: 6 });
  });

  it('treats a trailing date as a date, not a minor version', () => {
    expect(parseModelVersion('claude-haiku-4-5-20251001')).toEqual({ family: 'haiku', major: 4, minor: 5 });
    expect(parseModelVersion('claude-opus-4-1-20250805')).toEqual({ family: 'opus', major: 4, minor: 1 });
    expect(parseModelVersion('claude-opus-4-20250514')).toEqual({ family: 'opus', major: 4, minor: 0 });
  });

  it('parses the Claude 3 shape', () => {
    expect(parseModelVersion('claude-3-opus-20240229')).toEqual({ family: 'opus', major: 3, minor: 0 });
    expect(parseModelVersion('claude-3-5-haiku-20241022')).toEqual({ family: 'haiku', major: 3, minor: 5 });
  });

  it('returns null for unknown ids', () => {
    expect(parseModelVersion('gpt-4o')).toBeNull();
    expect(parseModelVersion(null)).toBeNull();
  });
});

describe('resolveRates', () => {
  it('costs current Opus 4.5+ at standard rates', () => {
    expect(resolveRates('claude-opus-4-8')).toEqual(PRICING.opus);
    expect(resolveRates('claude-opus-4-5')).toEqual(PRICING.opus);
  });

  it('costs legacy Opus (4, 4.1, Claude 3) at 3× rates', () => {
    expect(resolveRates('claude-opus-4-20250514')).toEqual(LEGACY_OPUS_RATES);
    expect(resolveRates('claude-opus-4-1-20250805')).toEqual(LEGACY_OPUS_RATES);
    expect(resolveRates('claude-3-opus-20240229')).toEqual(LEGACY_OPUS_RATES);
  });

  it('uses standard rates for Sonnet/Haiku/unknown', () => {
    expect(resolveRates('claude-sonnet-4-6')).toEqual(PRICING.sonnet);
    expect(resolveRates('claude-haiku-4-5-20251001')).toEqual(PRICING.haiku);
    expect(resolveRates('something-else')).toEqual(PRICING.other);
  });

  it('applies version-specific fast-mode rates for Opus 4.6+', () => {
    expect(resolveRates('claude-opus-4-8', { fastMode: true })).toEqual(FAST_OPUS_4_8_RATES);
    expect(resolveRates('claude-opus-4-7', { fastMode: true })).toEqual(FAST_OPUS_4_6_4_7_RATES);
    expect(resolveRates('claude-opus-4-6', { fastMode: true })).toEqual(FAST_OPUS_4_6_4_7_RATES);
  });

  it('ignores fast mode where it does not apply', () => {
    // Opus 4.5 has no fast tier; legacy + non-opus never get fast rates.
    expect(resolveRates('claude-opus-4-5', { fastMode: true })).toEqual(PRICING.opus);
    expect(resolveRates('claude-opus-4-1', { fastMode: true })).toEqual(LEGACY_OPUS_RATES);
    expect(resolveRates('claude-sonnet-4-6', { fastMode: true })).toEqual(PRICING.sonnet);
  });
});

describe('detectFastMode', () => {
  it('returns false for the standard tier Claude Code currently logs', () => {
    expect(detectFastMode('standard')).toBe(false);
    expect(detectFastMode(null)).toBe(false);
  });
});

describe('dollarize', () => {
  it('costs tokens against the provided rate card', () => {
    const d = dollarize(PRICING.opus, {
      ...emptyBuckets(),
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(d.inputUsd).toBeCloseTo(5.0, 6);
    expect(d.outputUsd).toBeCloseTo(25.0, 6);
    expect(d.totalUsd).toBeCloseTo(30.0, 6);
  });

  it('legacy Opus costs 3× a current-Opus turn', () => {
    const tokens = { ...emptyBuckets(), inputTokens: 1_000_000, outputTokens: 1_000_000 };
    const current = dollarize(resolveRates('claude-opus-4-8'), tokens).totalUsd;
    const legacy = dollarize(resolveRates('claude-opus-4-1'), tokens).totalUsd;
    expect(legacy).toBeCloseTo(current * 3, 6);
  });
});
