import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface EntrypointGlobal {
  entrypoint: string;
  sessionCount: number;
  totalTokens: number;
}

export interface WorstSession {
  sessionId: string;
  projectName: string;
  projectPath: string;
  primaryModel: string | null;
  effectiveness: number;
  totalTokens: number;
  cacheCreation: number;
  cacheRead: number;
  inputTokens: number;
  turnCount: number;
  lastTs: string;
}

export interface HourCacheCorrelation {
  hour: number;
  effectiveness: number;
  totalTokens: number;
}

export interface ForecastResponse {
  byHour: { hour: number; expectedChargeable: number }[];
  totalNext24h: number;
}

export function useEntrypoints() {
  return useQuery({
    queryKey: ['entrypoints'],
    queryFn: () => api<{ entrypoints: EntrypointGlobal[] }>('/entrypoints'),
  });
}

export function useWorstCacheSessions(days = 30) {
  return useQuery({
    queryKey: ['worstCache', days],
    queryFn: () => api<{ days: number; sessions: WorstSession[] }>(`/worst-cache-sessions?days=${days}`),
  });
}

export function useCacheByHour(days = 30) {
  return useQuery({
    queryKey: ['cacheByHour', days],
    queryFn: () => api<{ days: number; hours: HourCacheCorrelation[] }>(`/cache-by-hour?days=${days}`),
  });
}

export function useForecast(days = 30) {
  return useQuery({
    queryKey: ['forecast', days],
    queryFn: () => api<ForecastResponse>(`/forecast?days=${days}`),
  });
}

export interface ForecastDayResponse {
  date: string;
  source: 'snapshot' | 'historical';
  byHour: Array<{
    hour: number;
    expectedChargeable: number;
    actualChargeable: number | null;
  }>;
  totalForecast: number;
  totalActual: number | null;
  isToday: boolean;
  isPast: boolean;
  currentHour: number | null;
}

export function useForecastDay(date: string, days = 30) {
  return useQuery({
    queryKey: ['forecastDay', date, days],
    queryFn: () => api<ForecastDayResponse>(`/forecast/day?date=${date}&days=${days}`),
    staleTime: 60_000,
  });
}
