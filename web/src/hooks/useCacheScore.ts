import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CacheScore {
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  effectiveness: number;
}

export interface CacheScoreByProject extends CacheScore {
  projectPath: string;
  projectName: string;
}

export function useCacheScore(days?: number) {
  return useQuery({
    queryKey: ['cache', days ?? 'default'],
    queryFn: () =>
      api<{ days: number; overall: CacheScore; byProject: CacheScoreByProject[] }>(
        days ? `/cache-effectiveness?days=${days}` : `/cache-effectiveness`,
      ),
  });
}
