import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SessionSummary {
  session_id: string;
  primary_model: string | null;
  first_ts: string;
  last_ts: string;
  turn_count: number;
  is_subagent: number;
  parent_session_id: string | null;
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => api<{ sessions: SessionSummary[] }>(`/projects/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}
