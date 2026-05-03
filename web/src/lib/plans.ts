export interface PlanPreset {
  id: string;
  label: string;
  windowLimitTokens: number;
  blurb: string;
}

export const PLAN_PRESETS: PlanPreset[] = [
  { id: 'pro', label: 'Pro ($20/mo)', windowLimitTokens: 500_000, blurb: 'Estimated ~500k chargeable / 5h.' },
  { id: 'team', label: 'Team (per seat)', windowLimitTokens: 500_000, blurb: 'Estimated ~500k chargeable / 5h per seat.' },
  { id: 'max5', label: 'Max 5× ($100/mo)', windowLimitTokens: 2_500_000, blurb: 'Estimated ~5× Pro.' },
  { id: 'max20', label: 'Max 20× ($200/mo)', windowLimitTokens: 10_000_000, blurb: 'Estimated ~20× Pro.' },
  { id: 'enterprise', label: 'Enterprise / custom', windowLimitTokens: 25_000_000, blurb: 'Rough placeholder; tune to your contract.' },
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
