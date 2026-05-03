import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Settings {
  windowLimitTokens: number;
  activeWithinDays: number;
  cacheScoreWindowDays: number;
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (partial: Partial<Settings>) =>
      api<Settings>('/settings', { method: 'POST', body: JSON.stringify(partial) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['window'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['cache'] });
    },
  });
}
