import type { DB } from '../connection.js';
import { canonicalizePath } from '../../lib/pathAliases.js';
import { listAliases } from './pathAliases.js';

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

  const aliases = listAliases(db);
  const merged = new Map<string, ProjectRow>();

  for (const r of rows) {
    const rawPath = r.project_path as string;
    const canonical = canonicalizePath(rawPath, aliases);
    const sessionCount = r.session_count as number;
    const lastTouched = r.last_touched as string;
    const inputTokens = r.input_tokens as number;
    const outputTokens = r.output_tokens as number;
    const cacheReadTokens = r.cache_read_tokens as number;
    const cacheCreationTokens = r.cache_creation_tokens as number;
    const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;

    const existing = merged.get(canonical);
    if (!existing) {
      merged.set(canonical, {
        projectPath: canonical,
        // Prefer the canonical's own project_name if its row is present;
        // otherwise the first raw row we see wins (overwritten below when canonical shows up).
        projectName: rawPath === canonical ? (r.project_name as string) : (r.project_name as string),
        sessionCount,
        totalTokens,
        lastTouched,
        cacheReadTokens,
        cacheCreationTokens,
        inputTokens,
        isActive: lastTouched >= cutoff,
      });
    } else {
      // Prefer the canonical-row's own name if/when it shows up.
      if (rawPath === canonical) existing.projectName = r.project_name as string;
      existing.sessionCount += sessionCount;
      existing.totalTokens += totalTokens;
      existing.cacheReadTokens += cacheReadTokens;
      existing.cacheCreationTokens += cacheCreationTokens;
      existing.inputTokens += inputTokens;
      if (lastTouched > existing.lastTouched) existing.lastTouched = lastTouched;
      if (lastTouched >= cutoff) existing.isActive = true;
    }
  }

  return [...merged.values()].sort(
    (a, b) => new Date(b.lastTouched).getTime() - new Date(a.lastTouched).getTime(),
  );
}

export function projectDetail(db: DB, projectPaths: string[]) {
  if (projectPaths.length === 0) return { sessions: [] };
  const placeholders = projectPaths.map(() => '?').join(',');
  const sessions = db.prepare(
    `SELECT session_id, primary_model, first_ts, last_ts, turn_count, is_subagent, parent_session_id
     FROM sessions WHERE project_path IN (${placeholders}) ORDER BY last_ts DESC LIMIT 200`,
  ).all(...projectPaths);
  return { sessions };
}
