import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ProjectionStatus =
  | 'exhausted'
  | 'will-exhaust'
  | 'pace-warning'
  | 'ok'
  | 'insufficient-data';

export type ProjectionMethod = 'time-of-day' | 'linear';

export interface WeeklyProjection {
  windowStart: string | null;
  elapsedHours: number | null;
  remainingHours: number | null;
  averagePercentPerHour: number | null;
  projectedFinalPercent: number | null;
  etaToLimitHours: number | null;
  etaToLimitAt: string | null;
  status: ProjectionStatus;
  method: ProjectionMethod;
}

export interface WeeklyBar {
  percent: number;
  resetsAt: string | null;
  source: 'oauth' | 'statusline';
  projection: WeeklyProjection;
}

export interface WeeklyResponse {
  allModels: WeeklyBar | null;
  sonnet: WeeklyBar | null;
  claudeDesign: WeeklyBar | null;
  oauth: {
    enabled: boolean;
    credentialsPresent: boolean;
    credentialsSource: 'file' | 'keychain' | null;
    ageSeconds: number | null;
    lastError: string | null;
    fetchedAt: string | null;
  };
}

export function useWeekly() {
  return useQuery({
    queryKey: ['weekly'],
    queryFn: () => api<WeeklyResponse>('/weekly'),
    refetchInterval: 60_000,
  });
}
