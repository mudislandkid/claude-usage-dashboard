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

export interface ProjectHeader {
  projectPath: string;
  projectName: string;
  totalTokensLifetime: number;
  totalTokens30d: number;
  totalTokens7d: number;
  sessionCount: number;
  turnCount: number;
  primaryModel: string | null;
  firstActivity: string | null;
  lastActivity: string | null;
  gitBranches: string[];
}

export interface CacheStats {
  read: number;
  creation: number;
  input: number;
  effectiveness: number;
}

export interface SubagentStats {
  parentTokens: number;
  subagentTokens: number;
  parentTurns: number;
  subagentTurns: number;
  multiplier: number;
}

export interface CacheTtl {
  creation5m: number;
  creation1h: number;
  ratio1h: number;
}

export interface ActivityPoint {
  date: string;
  chargeable: number;
  totalTokens: number;
  turns: number;
}

export interface TopSession {
  sessionId: string;
  primaryModel: string | null;
  totalTokens: number;
  chargeable: number;
  turnCount: number;
  isSubagent: number;
  lastTs: string;
}

export interface Entrypoint {
  entrypoint: string;
  sessionCount: number;
}

export interface ModelMixOverTimePoint {
  date: string;
  opus: number;
  sonnet: number;
  haiku: number;
  other: number;
}

export interface CacheOverTimePoint {
  date: string;
  effectiveness: number;
  read: number;
  creation: number;
  input: number;
}

export interface ProjectDetailResponse {
  header: ProjectHeader | null;
  days: number;
  cache: CacheStats | null;
  modelMix: { opus: number; sonnet: number; haiku: number; other: number } | null;
  activity: ActivityPoint[];
  subagent: SubagentStats | null;
  cacheTtl: CacheTtl | null;
  topSessions: TopSession[];
  entrypoints: Entrypoint[];
  modelMixOverTime: ModelMixOverTimePoint[];
  cacheOverTime: CacheOverTimePoint[];
  toolUse: { toolName: string; count: number }[];
  sessions: SessionSummary[];
}

export function useProject(id: string | undefined, days = 30) {
  return useQuery({
    queryKey: ['project', id, days],
    queryFn: () =>
      api<ProjectDetailResponse>(`/projects/${encodeURIComponent(id!)}?days=${days}`),
    enabled: !!id,
  });
}
