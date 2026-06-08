import { useSettings } from './useSettings';
import { detectPlan } from '@/lib/plans';
import { PLAN_DEFS, type Plan } from '@/lib/pricing';

/**
 * Returns the *purchased* plan based on the limit saved in Settings.
 *
 * Derive this from the Settings limit (the plan you *pay for*), not from the
 * live 5h gauge. `window.effectiveLimitTokens` is now pinned to this same
 * configured limit, but routing plan detection through Settings keeps it
 * decoupled from the gauge's bridge state.
 */
export function useCurrentPlan(): Plan | null {
  const { data } = useSettings();
  if (!data) return null;
  const id = detectPlan(data.windowLimitTokens);
  return (PLAN_DEFS as Record<string, Plan>)[id] ?? PLAN_DEFS.custom;
}
