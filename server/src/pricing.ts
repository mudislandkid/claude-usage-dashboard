/**
 * Anthropic API pricing — current public list prices as of 2026-05.
 * Source: https://docs.anthropic.com/en/docs/about-claude/pricing
 *
 * Rates are in USD per million tokens (per "MTok").
 *
 * NOTE — Opus pricing dropped substantially with Claude 4.5:
 *   Opus 4 / 4.1 / 3 (legacy):  $15 input / $75 output  (3× current)
 *   Opus 4.5 / 4.6 / 4.7:        $5 input  / $25 output
 *
 * We can't distinguish Opus 4 vs 4.5+ from the JSONL `model` string alone
 * without a per-version table — but in practice Claude Code is now on 4.5+,
 * so we use current rates. Sonnet 4.x and Haiku 4.5 unchanged.
 */
import type { ModelFamily } from './db/queries/modelMix.js';

export interface ModelRates {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

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

export function dollarize(family: ModelFamily, t: TokenBuckets): DollarBuckets {
  const r = PRICING[family];
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
