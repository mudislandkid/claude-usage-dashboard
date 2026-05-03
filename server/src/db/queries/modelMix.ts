import type { DB } from '../connection.js';

export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | 'other';

export interface ModelMixRow {
  projectPath: string;
  projectName: string;
  opusTokens: number;
  sonnetTokens: number;
  haikuTokens: number;
  otherTokens: number;
}

export function classifyModel(model: string | null): ModelFamily {
  if (!model) return 'other';
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'other';
}

export function modelMixByProject(db: DB, days: number): ModelMixRow[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db.prepare(
    `SELECT
       s.project_path,
       MAX(s.project_name) AS project_name,
       t.model,
       COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS tokens
     FROM sessions s
     JOIN turns t ON t.session_id = s.session_id
     WHERE t.ts >= ?
     GROUP BY s.project_path, t.model`,
  ).all(cutoff) as Array<{ project_path: string; project_name: string; model: string; tokens: number }>;

  const acc = new Map<string, ModelMixRow>();
  for (const r of rows) {
    const key = r.project_path;
    let row = acc.get(key);
    if (!row) {
      row = {
        projectPath: r.project_path,
        projectName: r.project_name,
        opusTokens: 0,
        sonnetTokens: 0,
        haikuTokens: 0,
        otherTokens: 0,
      };
      acc.set(key, row);
    }
    const family = classifyModel(r.model);
    if (family === 'opus') row.opusTokens += r.tokens;
    else if (family === 'sonnet') row.sonnetTokens += r.tokens;
    else if (family === 'haiku') row.haikuTokens += r.tokens;
    else row.otherTokens += r.tokens;
  }
  return [...acc.values()].sort(
    (a, b) =>
      b.opusTokens + b.sonnetTokens + b.haikuTokens + b.otherTokens -
      (a.opusTokens + a.sonnetTokens + a.haikuTokens + a.otherTokens),
  );
}
