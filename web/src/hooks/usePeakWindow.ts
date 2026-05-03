import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PeakWindowResponse {
  days: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  samples: number;
}

export function usePeakWindow(days = 30) {
  return useQuery({
    queryKey: ['peakWindow', days],
    queryFn: () => api<PeakWindowResponse>(`/peak-window?days=${days}`),
  });
}
