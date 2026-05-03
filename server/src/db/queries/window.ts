import type { DB } from '../connection.js';

export interface WindowStats {
  windowStart: string;
  windowEnd: string;
  totalChargeable: number;
  inputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  burnRatePerMin: number;
}

export function fiveHourWindow(db: DB, now = new Date()): WindowStats {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const last15Start = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

  const row = db.prepare(
    `SELECT
       COALESCE(SUM(input_tokens), 0)          AS input_tokens,
       COALESCE(SUM(output_tokens), 0)         AS output_tokens,
       COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
       COALESCE(SUM(cache_read_tokens), 0)     AS cache_read_tokens
     FROM turns WHERE ts >= ? AND ts <= ?`,
  ).get(start, end) as Record<string, number>;

  const recent = db.prepare(
    `SELECT COALESCE(SUM(input_tokens + cache_creation_tokens), 0) AS chargeable
     FROM turns WHERE ts >= ? AND ts <= ?`,
  ).get(last15Start, end) as { chargeable: number };

  const totalChargeable = (row.input_tokens ?? 0) + (row.cache_creation_tokens ?? 0);

  return {
    windowStart: start,
    windowEnd: end,
    totalChargeable,
    inputTokens: row.input_tokens ?? 0,
    cacheCreationTokens: row.cache_creation_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    cacheReadTokens: row.cache_read_tokens ?? 0,
    burnRatePerMin: (recent.chargeable ?? 0) / 15,
  };
}
