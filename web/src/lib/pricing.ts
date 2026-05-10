// API pricing (USD per million tokens) — Anthropic public rates as of 2026-05.
// https://docs.anthropic.com/en/docs/about-claude/pricing
//
// NOTE: Opus 4.5+ pricing dropped substantially from legacy Opus 4 / 4.1
// ($15/$75) to $5/$25. We use current rates since Claude Code is now on 4.5+.
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

