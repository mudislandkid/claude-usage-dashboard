import type { DB } from '../connection.js';

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

export function listProjects(db: DB, activeWithinDays = 14): ProjectRow[] {
  const cutoff = new Date(Date.now() - activeWithinDays * 86_400_000).toISOString();
  const rows = db.prepare(
    `SELECT
       s.project_path,
       MAX(s.project_name)              AS project_name,
       COUNT(DISTINCT s.session_id)     AS session_count,
       MAX(s.last_ts)                   AS last_touched,
       COALESCE(SUM(t.input_tokens), 0)          AS input_tokens,
       COALESCE(SUM(t.output_tokens), 0)         AS output_tokens,
       COALESCE(SUM(t.cache_read_tokens), 0)     AS cache_read_tokens,
       COALESCE(SUM(t.cache_creation_tokens), 0) AS cache_creation_tokens
     FROM sessions s
     LEFT JOIN turns t ON t.session_id = s.session_id
     GROUP BY s.project_path
     ORDER BY last_touched DESC`,
  ).all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    projectPath: r.project_path as string,
    projectName: r.project_name as string,
    sessionCount: r.session_count as number,
    totalTokens:
      (r.input_tokens as number) +
      (r.output_tokens as number) +
      (r.cache_read_tokens as number) +
      (r.cache_creation_tokens as number),
    lastTouched: r.last_touched as string,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheCreationTokens: r.cache_creation_tokens as number,
    inputTokens: r.input_tokens as number,
    isActive: (r.last_touched as string) >= cutoff,
  }));
}

export function projectDetail(db: DB, projectPath: string) {
  const sessions = db.prepare(
    `SELECT session_id, primary_model, first_ts, last_ts, turn_count, is_subagent, parent_session_id
     FROM sessions WHERE project_path = ? ORDER BY last_ts DESC LIMIT 200`,
  ).all(projectPath);
  return { sessions };
}
