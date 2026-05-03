export interface PlanPreset {
  id: string;
  label: string;
  windowLimitTokens: number;
  blurb: string;
}

/**
 * Anthropic does not publish exact 5h token caps. These are calibrated
 * estimates: Max 20× was empirically observed at ~21.5M chargeable
 * (input + cache_creation_input) tokens against Claude Code's own
 * "22%" 5-hour readout. Other tiers are scaled proportionally from the
 * publicly-stated 5×/20× multipliers anchored to Pro.
 */
export const PLAN_PRESETS: PlanPreset[] = [
  {
    id: 'pro',
    label: 'Pro ($20/mo)',
    windowLimitTokens: 1_100_000,
    blurb: 'Estimated ~1.1M chargeable / 5h. Anchored from Max 20× ÷ 20.',
  },
  {
    id: 'team',
    label: 'Team (per seat)',
    windowLimitTokens: 1_100_000,
    blurb: 'Estimated ~1.1M chargeable / 5h per seat (similar to Pro).',
  },
  {
    id: 'max5',
    label: 'Max 5× ($100/mo)',
    windowLimitTokens: 5_500_000,
    blurb: 'Estimated ~5× Pro.',
  },
  {
    id: 'max20',
    label: 'Max 20× ($200/mo)',
    windowLimitTokens: 21_500_000,
    blurb: 'Calibrated against observed Claude Code 5h readout (~22% at 4.7M chargeable ⇒ ~21.5M cap).',
  },
  {
    id: 'enterprise',
    label: 'Enterprise / custom',
    windowLimitTokens: 50_000_000,
    blurb: 'Rough placeholder; tune to your contract.',
  },
];

export const CUSTOM_PLAN: PlanPreset = {
  id: 'custom',
  label: 'Custom (manual)',
  windowLimitTokens: 0,
  blurb: 'Set the limit manually below.',
};

export function detectPlan(currentLimit: number): string {
  const match = PLAN_PRESETS.find((p) => p.windowLimitTokens === currentLimit);
  return match?.id ?? CUSTOM_PLAN.id;
}
