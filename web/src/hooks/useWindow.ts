import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface WindowResponse {
  windowStart: string;
  windowEnd: string;
  totalChargeable: number;
  inputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  burnRatePerMin: number;
  limitTokens: number;
  percentUsed: number;
  minutesToLimit: number | null;
}

export function useWindow() {
  return useQuery({
    queryKey: ['window'],
    queryFn: () => api<WindowResponse>('/window'),
  });
}
