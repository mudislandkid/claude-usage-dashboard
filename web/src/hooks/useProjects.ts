import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProjectRow {
  projectPath: string;
  projectName: string;
  sessionCount: number;
  totalTokens: number;
  lastTouched: string;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  isActive: boolean;
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api<{ projects: ProjectRow[] }>('/projects'),
  });
}
