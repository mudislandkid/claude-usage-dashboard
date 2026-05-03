import type { DB } from '../connection.js';

export interface HeatCell {
  weekday: number;
  hour: number;
  tokens: number;
  sessionCount: number;
}

export function heatmap(db: DB, days: number): HeatCell[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db.prepare(
    `SELECT
       CAST(strftime('%w', ts) AS INTEGER) AS weekday,
       CAST(strftime('%H', ts) AS INTEGER) AS hour,
       COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens), 0) AS tokens,
       COUNT(DISTINCT session_id) AS session_count
     FROM turns WHERE ts >= ?
     GROUP BY weekday, hour`,
  ).all(cutoff) as Array<Record<string, number>>;
  return rows.map((r) => ({
    weekday: r.weekday ?? 0,
    hour: r.hour ?? 0,
    tokens: r.tokens ?? 0,
    sessionCount: r.session_count ?? 0,
  }));
}
