import { useSettings } from './useSettings';
import { detectPlan } from '@/lib/plans';
import { PLAN_DEFS, type Plan } from '@/lib/pricing';

/**
 * Returns the *purchased* plan based on the limit saved in Settings.
 *
 * IMPORTANT: do not derive this from `window.effectiveLimitTokens` — when the
 * Anthropic statusline bridge is live, effectiveLimitTokens is back-calculated
 * from Anthropic's reported % (used / pct) and can land anywhere depending on
 * the moment-to-moment cap Anthropic is applying. The plan you *pay for*
 * lives in Settings.
 */
export function useCurrentPlan(): Plan | null {
  const { data } = useSettings();
  if (!data) return null;
  const id = detectPlan(data.windowLimitTokens);
  return (PLAN_DEFS as Record<string, Plan>)[id] ?? PLAN_DEFS.custom;
}
