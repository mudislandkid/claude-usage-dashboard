import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface TtlLeakageStats {
  totalCreation1h: number;
  usefulIn1h: number;
  wastedNoFollowup: number;
  wasted5mSufficient: number;
  leakageRatio: number;
}

export interface ProjectTtlLeakage extends TtlLeakageStats {
  projectPath: string;
  projectName: string;
}

export interface VersionRow {
  version: string;
  sessionCount: number;
  earliest: string;
  latest: string;
  totalTokens: number;
}

export function useTtlLeakage(days = 30) {
  return useQuery({
    queryKey: ['ttlLeakage', days],
    queryFn: () =>
      api<{
        days: number;
        overall: TtlLeakageStats;
        byProject: ProjectTtlLeakage[];
      }>(`/ttl-leakage?days=${days}`),
  });
}

export function useVersionAdoption() {
  return useQuery({
    queryKey: ['versionAdoption'],
    queryFn: () => api<{ versions: VersionRow[] }>('/version-adoption'),
  });
}
