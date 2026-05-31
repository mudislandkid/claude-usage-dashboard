/**
 * Anthropic API pricing — current public list prices as of 2026-05-31.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 *
 * Rates are in USD per million tokens (per "MTok").
 *
 * Current lineup (latest per family): Opus 4.8 · Sonnet 4.6 · Haiku 4.5.
 * Pricing is keyed by family because every current member of a family shares
 * the same rates:
 *   Opus 4.5 / 4.6 / 4.7 / 4.8:   $5 input  / $25 output
 *   Opus 4 / 4.1 / 3 (legacy):    $15 input / $75 output  (3× current)
 *   Sonnet 4 / 4.5 / 4.6:          $3 input  / $15 output
 *   Haiku 4.5:                     $1 input  / $5 output
 *
 * We can't distinguish Opus 4 vs 4.5+ from the JSONL `model` string alone
 * without a per-version table — but in practice Claude Code is now on 4.5+,
 * so we use current rates.
 *
 * NOTE: Opus 4.7 and later use a new tokenizer (up to ~35% more tokens for
 * the same text). This only affects token *counts*, not per-token rates — we
 * cost the actual token counts recorded in the JSONL, so no adjustment here.
 */
import { classifyModel, type ModelFamily } from './db/queries/modelMix.js';

export interface ModelRates {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

/** Current-generation standard list rates, keyed by family. */
export const PRICING: Record<ModelFamily, ModelRates> = {
  opus: {
    input: 5.0,
    output: 25.0,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10.0,
    cacheRead: 0.5,
  },
  sonnet: {
    input: 3.0,
    output: 15.0,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6.0,
    cacheRead: 0.3,
  },
  haiku: {
    input: 1.0,
    output: 5.0,
    cacheWrite5m: 1.25,
    cacheWrite1h: 2.0,
    cacheRead: 0.1,
  },
  // Unknown / future model families — fall back to Sonnet rates as a
  // middle-of-the-road estimate.
  other: {
    input: 3.0,
    output: 15.0,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6.0,
    cacheRead: 0.3,
  },
};

/**
 * Legacy Opus rates (Claude 3 Opus, Opus 4, Opus 4.1) — 3× the current price.
 * Applied to any Opus model older than 4.5.
 */
export const LEGACY_OPUS_RATES: ModelRates = {
  input: 15.0,
  output: 75.0,
  cacheWrite5m: 18.75,
  cacheWrite1h: 30.0,
  cacheRead: 1.5,
};

/**
 * Fast mode (Claude Code premium output) rates. Fast mode is a per-request
 * option with premium pricing that differs by Opus version:
 *   Opus 4.8:        $10 input / $50 output
 *   Opus 4.6 / 4.7:  $30 input / $150 output
 * Cache multipliers (5m 1.25× · 1h 2× · read 0.10×) apply on top of the fast
 * input rate, per docs.anthropic pricing. Fast mode is Opus-only (4.6+).
 */
export const FAST_OPUS_4_8_RATES: ModelRates = {
  input: 10.0,
  output: 50.0,
  cacheWrite5m: 12.5,
  cacheWrite1h: 20.0,
  cacheRead: 1.0,
};
export const FAST_OPUS_4_6_4_7_RATES: ModelRates = {
  input: 30.0,
  output: 150.0,
  cacheWrite5m: 37.5,
  cacheWrite1h: 60.0,
  cacheRead: 3.0,
};

export interface ModelVersion {
  family: ModelFamily;
  major: number;
  minor: number;
}

/**
 * Parse the family + numeric version out of a model id. Handles both the
 * Claude 4+ shape (`claude-opus-4-8`, `claude-opus-4-1-20250805`) and the
 * Claude 3 shape (`claude-3-opus-20240229`). Trailing date suffixes (>2 digits)
 * are treated as dates, not minor versions. Returns null for unrecognized ids.
 */
export function parseModelVersion(model: string | null): ModelVersion | null {
  if (!model) return null;
  const family = classifyModel(model);
  if (family === 'other') return null;
  const m = model.toLowerCase();

  // Claude 3 shape: claude-3-opus / claude-3-5-haiku
  const legacy = m.match(/claude-(\d+)(?:-(\d+))?-(?:opus|sonnet|haiku)/);
  if (legacy) {
    const minor = legacy[2] && legacy[2].length <= 2 ? Number(legacy[2]) : 0;
    return { family, major: Number(legacy[1]), minor };
  }

  // Claude 4+ shape: claude-opus-4-8 (minor optional; date suffix ignored)
  const modern = m.match(/(?:opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
  if (modern) {
    const minor = modern[2] && modern[2].length <= 2 ? Number(modern[2]) : 0;
    return { family, major: Number(modern[1]), minor };
  }
  return null;
}

export interface RateOpts {
  /** Apply Claude Code fast-mode premium rates (Opus 4.6+ only). */
  fastMode?: boolean;
}

/**
 * Resolve the correct rate card for a specific model id, accounting for the
 * Opus version split (legacy 4/4.1 vs current 4.5+) and the optional fast-mode
 * premium. Sonnet/Haiku/other have a single current rate card each.
 */
export function resolveRates(model: string | null, opts: RateOpts = {}): ModelRates {
  const family = classifyModel(model);
  if (family !== 'opus') return PRICING[family];

  const v = parseModelVersion(model);
  const isLegacy = v ? v.major < 4 || (v.major === 4 && v.minor < 5) : false;

  if (opts.fastMode && !isLegacy) {
    // Fast mode is available for Opus 4.6+. Unknown version → assume latest.
    const is48plus = v ? v.major > 4 || (v.major === 4 && v.minor >= 8) : true;
    const is46plus = v ? v.major > 4 || (v.major === 4 && v.minor >= 6) : true;
    if (is48plus) return FAST_OPUS_4_8_RATES;
    if (is46plus) return FAST_OPUS_4_6_4_7_RATES;
    // Opus 4.5 has no fast tier — fall through to standard rates.
  }

  return isLegacy ? LEGACY_OPUS_RATES : PRICING.opus;
}

/**
 * Detect whether a turn used Claude Code fast mode, from the raw JSONL fields.
 *
 * NOTE — as of 2026-05, Claude Code does NOT log a fast-mode signal: every
 * record's `service_tier` is "standard", and there is no `fast`/`beta` field.
 * `service_tier` reflects Anthropic *Priority Tier*, which is a separate
 * billing dimension from Claude Code fast mode. This is the single place to
 * wire detection on once the JSONL carries a fast-mode flag — return true for
 * that signal and fast rates flow through `resolveRates`/cost math everywhere.
 */
export function detectFastMode(_serviceTier: string | null): boolean {
  return false;
}

/**
 * Per-bucket dollar cost for one model family, given the raw token counts.
 * Cache writes are split into 5m and 1h buckets because the multipliers differ.
 */
export interface TokenBuckets {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
}

export interface DollarBuckets {
  inputUsd: number;
  outputUsd: number;
  cacheReadUsd: number;
  cacheCreation5mUsd: number;
  cacheCreation1hUsd: number;
  totalUsd: number;
}

export function dollarize(r: ModelRates, t: TokenBuckets): DollarBuckets {
  const inputUsd = (t.inputTokens / 1_000_000) * r.input;
  const outputUsd = (t.outputTokens / 1_000_000) * r.output;
  const cacheReadUsd = (t.cacheReadTokens / 1_000_000) * r.cacheRead;
  const cacheCreation5mUsd = (t.cacheCreation5mTokens / 1_000_000) * r.cacheWrite5m;
  const cacheCreation1hUsd = (t.cacheCreation1hTokens / 1_000_000) * r.cacheWrite1h;
  return {
    inputUsd,
    outputUsd,
    cacheReadUsd,
    cacheCreation5mUsd,
    cacheCreation1hUsd,
    totalUsd:
      inputUsd +
      outputUsd +
      cacheReadUsd +
      cacheCreation5mUsd +
      cacheCreation1hUsd,
  };
}

export function emptyBuckets(): TokenBuckets {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
  };
}

export function addBuckets(a: TokenBuckets, b: TokenBuckets): void {
  a.inputTokens += b.inputTokens;
  a.outputTokens += b.outputTokens;
  a.cacheReadTokens += b.cacheReadTokens;
  a.cacheCreation5mTokens += b.cacheCreation5mTokens;
  a.cacheCreation1hTokens += b.cacheCreation1hTokens;
}
