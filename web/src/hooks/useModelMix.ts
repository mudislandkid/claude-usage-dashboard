import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ModelMixRow {
  projectPath: string;
  projectName: string;
  opusTokens: number;
  sonnetTokens: number;
  haikuTokens: number;
  otherTokens: number;
}

export function useModelMix(days: number) {
  return useQuery({
    queryKey: ['modelMix', days],
    queryFn: () => api<{ days: number; rows: ModelMixRow[] }>(`/model-mix?days=${days}`),
  });
}
