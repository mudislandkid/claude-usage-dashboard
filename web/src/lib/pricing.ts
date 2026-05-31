// API pricing (USD per million tokens) — Anthropic public rates as of 2026-05-31.
// https://platform.claude.com/docs/en/about-claude/pricing
//
// Current latest per family: Opus 4.8 · Sonnet 4.6 · Haiku 4.5. Rates are keyed
// by family since every current member shares them. Opus 4.5+ ($5/$25) dropped
// substantially from legacy Opus 4 / 4.1 ($15/$75); Claude Code is now on 4.5+.
// Authoritative cost math now happens server-side in /api/cost-breakdown;
// these constants are only used for legacy/display purposes and as a fallback.
export interface ModelRates {
  label: string;
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

export const PRICING: Record<'opus' | 'sonnet' | 'haiku', ModelRates> = {
  opus: {
    label: 'Opus',
    input: 5.0,
    output: 25.0,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10.0,
    cacheRead: 0.5,
  },
  sonnet: {
    label: 'Sonnet',
    input: 3.0,
    output: 15.0,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6.0,
    cacheRead: 0.3,
  },
  haiku: {
    label: 'Haiku',
    input: 1.0,
    output: 5.0,
    cacheWrite5m: 1.25,
    cacheWrite1h: 2.0,
    cacheRead: 0.1,
  },
};

// Legacy Opus (Claude 3 Opus, Opus 4, Opus 4.1) — 3× current Opus rates.
// Costed automatically server-side when such a model id appears in the data.
export const LEGACY_OPUS_RATES: ModelRates = {
  label: 'Opus 4/4.1 (legacy)',
  input: 15.0,
  output: 75.0,
  cacheWrite5m: 18.75,
  cacheWrite1h: 30.0,
  cacheRead: 1.5,
};

// Fast mode (Claude Code premium output, Opus 4.6+). Shown for reference only —
// Claude Code does not currently log a fast-mode flag, so it isn't applied to
// cost math. Cache multipliers (1.25×/2×/0.10×) apply on top of the fast input.
export const FAST_RATES: ModelRates[] = [
  {
    label: 'Opus 4.8 · fast',
    input: 10.0,
    output: 50.0,
    cacheWrite5m: 12.5,
    cacheWrite1h: 20.0,
    cacheRead: 1.0,
  },
  {
    label: 'Opus 4.6/4.7 · fast',
    input: 30.0,
    output: 150.0,
    cacheWrite5m: 37.5,
    cacheWrite1h: 60.0,
    cacheRead: 3.0,
  },
];

export interface Plan {
  id: 'pro' | 'max5' | 'max20' | 'team' | 'enterprise' | 'custom' | 'api';
  name: string;
  monthly: number;
}

export const PLAN_DEFS = {
  pro: { id: 'pro', name: 'Pro', monthly: 20 } as Plan,
  team: { id: 'team', name: 'Team', monthly: 30 } as Plan,
  max5: { id: 'max5', name: 'Max 5×', monthly: 100 } as Plan,
  max20: { id: 'max20', name: 'Max 20×', monthly: 200 } as Plan,
  enterprise: { id: 'enterprise', name: 'Enterprise', monthly: 0 } as Plan,
  custom: { id: 'custom', name: 'Custom', monthly: 0 } as Plan,
};

export function fmtUSD(v: number): string {
  return (
    '$' +
    v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  );
}

export function fmtUSDCompact(v: number): string {
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
  if (Math.abs(v) >= 100) return '$' + v.toFixed(0);
  return '$' + v.toFixed(2);
}

