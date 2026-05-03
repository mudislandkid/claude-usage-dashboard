import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ToolUseRow {
  toolName: string;
  count: number;
}

export interface CompactionStat {
  projectPath: string;
  projectName: string;
  totalTurns: number;
  compactedTurns: number;
  totalIterations: number;
  compactionRate: number;
}

export interface ModelRecommendation {
  projectPath: string;
  projectName: string;
  opusToolHeavyTokens: number;
  totalToolHeavyTokens: number;
  opusToolHeavyRatio: number;
  toolCalls: number;
}

export function useToolUse(days = 30) {
  return useQuery({
    queryKey: ['toolUse', days],
    queryFn: () => api<{ days: number; tools: ToolUseRow[] }>(`/tool-use?days=${days}`),
  });
}

export function useCompaction(days = 30) {
  return useQuery({
    queryKey: ['compaction', days],
    queryFn: () => api<{ days: number; projects: CompactionStat[] }>(`/compaction?days=${days}`),
  });
}

export function useModelRecommendations(days = 30) {
  return useQuery({
    queryKey: ['modelRec', days],
    queryFn: () =>
      api<{ days: number; recommendations: ModelRecommendation[] }>(
        `/model-recommendations?days=${days}`,
      ),
  });
}
