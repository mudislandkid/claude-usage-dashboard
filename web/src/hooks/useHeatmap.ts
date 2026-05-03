import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface HeatCell {
  weekday: number;
  hour: number;
  tokens: number;
  sessionCount: number;
}

export function useHeatmap(days: number) {
  return useQuery({
    queryKey: ['heatmap', days],
    queryFn: () => api<{ days: number; cells: HeatCell[] }>(`/heatmap?days=${days}`),
  });
}
