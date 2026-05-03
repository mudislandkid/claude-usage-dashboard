import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SessionRow {
  session_id: string;
  project_name: string | null;
  primary_model: string | null;
  first_ts: string;
  last_ts: string;
  turn_count: number;
}

export interface SubagentRow {
  session_id: string;
  primary_model: string | null;
  first_ts: string;
  last_ts: string;
  turn_count: number;
}

export interface TurnRow {
  session_id: string;
  ts: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export interface SubSession {
  startTs: string;
  endTs: string;
  durationMinutes: number;
  turns: number;
  totalTokens: number;
  chargeable: number;
}

export interface SessionDetailResponse {
  session: SessionRow | undefined;
  subagents: SubagentRow[];
  turns: TurnRow[];
  subSessions: SubSession[];
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => api<SessionDetailResponse>(`/sessions/${id}`),
    enabled: !!id,
  });
}
