import type { DB } from '../connection.js';

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

function computeScore(read: number, creation: number, input: number): number {
  const denom = read + creation + input;
  return denom === 0 ? 0 : read / denom;
}

export function overallCacheScore(db: DB, days: number): CacheScore {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const r = db.prepare(
    `SELECT
       COALESCE(SUM(cache_read_tokens), 0)     AS read,
       COALESCE(SUM(cache_creation_tokens), 0) AS creation,
       COALESCE(SUM(input_tokens), 0)          AS input
     FROM turns WHERE ts >= ?`,
  ).get(cutoff) as { read: number; creation: number; input: number };
  return {
    cacheReadTokens: r.read,
    cacheCreationTokens: r.creation,
    inputTokens: r.input,
    effectiveness: computeScore(r.read, r.creation, r.input),
  };
}

export function cacheScoreByProject(db: DB, days: number): CacheScoreByProject[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db.prepare(
    `SELECT
       s.project_path,
       MAX(s.project_name) AS project_name,
       COALESCE(SUM(t.cache_read_tokens), 0)     AS read,
       COALESCE(SUM(t.cache_creation_tokens), 0) AS creation,
       COALESCE(SUM(t.input_tokens), 0)          AS input
     FROM sessions s
     JOIN turns t ON t.session_id = s.session_id
     WHERE t.ts >= ?
     GROUP BY s.project_path
     ORDER BY (read * 1.0 / NULLIF(read + creation + input, 0)) ASC`,
  ).all(cutoff) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    projectPath: r.project_path as string,
    projectName: r.project_name as string,
    cacheReadTokens: r.read as number,
    cacheCreationTokens: r.creation as number,
    inputTokens: r.input as number,
    effectiveness: computeScore(
      r.read as number,
      r.creation as number,
      r.input as number,
    ),
  }));
}
