import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | 'other';

export interface CacheTtlEfficiency {
  days: number;
  totals: {
    writes5m: number;
    writes1h: number;
    tokens5m: number;
    tokens1h: number;
    share1hByTokens: number;
  };
  classification: {
    usefulTokens: number;
    wasted5mTokens: number;
    staleTokens: number;
    usefulWrites: number;
    wasted5mWrites: number;
    staleWrites: number;
    wasteRatio: number;
  };
  histogram: Array<{ bucket: string; writes: number; tokens: number }>;
  cost: {
    perModel: Array<{ model: ModelFamily; wastedTokens: number; premiumUsd: number }>;
    totalPremiumUsdMonthly: number;
    totalPremiumUsdSampled: number;
    methodology: string;
  };
}

export function useCacheTtlEfficiency(days = 30) {
  return useQuery({
    queryKey: ['cache-ttl-efficiency', days],
    queryFn: () => api<CacheTtlEfficiency>(`/cache-ttl-efficiency?days=${days}`),
  });
}
