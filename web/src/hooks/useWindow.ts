import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface WindowResponse {
  windowActive: boolean;
  windowStart: string | null;
  windowEnd: string | null;
  totalChargeable: number;
  inputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  burnRatePerMin: number;
  limitTokens: number;
  effectiveLimitTokens: number;
  percentUsed: number;
  minutesToReset: number | null;
  minutesToLimit: number | null;
  projectedTokensAtReset: number | null;
  headroomTokensAtReset: number | null;
  bridge: {
    active: boolean;
    source: 'anthropic' | 'estimated';
    sidecarPresent: boolean;
    capturedAt: string | null;
    ageSeconds: number | null;
    fiveHourPercent: number | null;
    fiveHourResetsAt: string | null;
    sevenDayPercent: number | null;
    sevenDayResetsAt: string | null;
  };
}

export function useWindow() {
  return useQuery({
    queryKey: ['window'],
    queryFn: () => api<WindowResponse>('/window'),
    // 10s poll keeps the 5h gauge fresh against the live statusline bridge
    // without hammering the server. The gauge displays whatever the server
    // returns verbatim — no client-side projection between polls.
    refetchInterval: 10_000,
  });
}
