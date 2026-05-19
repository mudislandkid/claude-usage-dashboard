import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | 'other';

export interface ModelRates {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

export interface DollarBuckets {
  inputUsd: number;
  outputUsd: number;
  cacheReadUsd: number;
  cacheCreation5mUsd: number;
  cacheCreation1hUsd: number;
  totalUsd: number;
}

export interface TokenBuckets {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
}

export interface ModelBucket extends TokenBuckets, DollarBuckets {
  family: ModelFamily;
}

export interface ProjectCost extends DollarBuckets {
  projectPath: string;
  projectName: string;
  totalTokens: number;
  byModel: ModelBucket[];
}

export interface CostBreakdown {
  days: number;
  pricing: Record<ModelFamily, ModelRates>;
  total: DollarBuckets & TokenBuckets;
  byModel: ModelBucket[];
  byProject: ProjectCost[];
}

/** Pass `days = 0` for an all-time breakdown (no date filter). */
export function useCostBreakdown(days = 30) {
  return useQuery({
    queryKey: ['costBreakdown', days],
    queryFn: () => api<CostBreakdown>(`/cost-breakdown?days=${days}`),
  });
}
