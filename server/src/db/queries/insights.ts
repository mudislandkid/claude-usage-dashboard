import type { DB } from '../connection.js';

export interface EntrypointGlobal {
  entrypoint: string;
  sessionCount: number;
  totalTokens: number;
}

export interface WorstSession {
  sessionId: string;
  projectName: string;
  projectPath: string;
  primaryModel: string | null;
  effectiveness: number;
  totalTokens: number;
  cacheCreation: number;
  cacheRead: number;
  inputTokens: number;
  turnCount: number;
  lastTs: string;
}

export interface HourCacheCorrelation {
  hour: number;
  effectiveness: number;
  read: number;
  creation: number;
  input: number;
  totalTokens: number;
}

export interface ForecastPoint {
  weekday: number;
  avgChargeable: number;
  samples: number;
}

export interface ForecastNext24h {
  byHour: { hour: number; expectedChargeable: number }[];
  totalNext24h: number;
}

export function entrypointsGlobal(db: DB): EntrypointGlobal[] {
  const rows = db
    .prepare(
      `SELECT
         COALESCE(s.entrypoint, 'unknown') AS entrypoint,
         COUNT(DISTINCT s.session_id) AS session_count,
         COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS tokens
       FROM sessions s LEFT JOIN turns t ON t.session_id = s.session_id
       GROUP BY entrypoint
       ORDER BY tokens DESC`,
    )
    .all() as Array<{ entrypoint: string; session_count: number; tokens: number }>;
  return rows.map((r) => ({
    entrypoint: r.entrypoint,
    sessionCount: r.session_count,
    totalTokens: r.tokens,
  }));
}

export function worstCacheSessions(db: DB, days: number, minTokens = 200_000, limit = 10): WorstSession[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT
         s.session_id, s.project_path, s.project_name, s.primary_model,
         s.turn_count, s.last_ts,
         COALESCE(SUM(t.cache_read_tokens), 0)     AS read,
         COALESCE(SUM(t.cache_creation_tokens), 0) AS creation,
         COALESCE(SUM(t.input_tokens), 0)          AS input,
         COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS total
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE t.ts >= ?
       GROUP BY s.session_id
       HAVING total >= ?
       ORDER BY (read * 1.0 / NULLIF(read + creation + input, 0)) ASC
       LIMIT ?`,
    )
    .all(cutoff, minTokens, limit) as Array<{
      session_id: string;
      project_path: string;
      project_name: string;
      primary_model: string | null;
      turn_count: number;
      last_ts: string;
      read: number;
      creation: number;
      input: number;
      total: number;
    }>;
  return rows.map((r) => {
    const denom = r.read + r.creation + r.input;
    return {
      sessionId: r.session_id,
      projectName: r.project_name,
      projectPath: r.project_path,
      primaryModel: r.primary_model,
      effectiveness: denom === 0 ? 0 : r.read / denom,
      totalTokens: r.total,
      cacheCreation: r.creation,
      cacheRead: r.read,
      inputTokens: r.input,
      turnCount: r.turn_count,
      lastTs: r.last_ts,
    };
  });
}

export function cacheByHourOfDay(db: DB, days: number): HourCacheCorrelation[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT
         CAST(strftime('%H', ts) AS INTEGER) AS hour,
         COALESCE(SUM(cache_read_tokens), 0)     AS read,
         COALESCE(SUM(cache_creation_tokens), 0) AS creation,
         COALESCE(SUM(input_tokens), 0)          AS input,
         COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens), 0) AS total
       FROM turns
       WHERE ts >= ?
       GROUP BY hour
       ORDER BY hour ASC`,
    )
    .all(cutoff) as Array<{
      hour: number;
      read: number;
      creation: number;
      input: number;
      total: number;
    }>;
  const byHour = new Map<number, HourCacheCorrelation>();
  for (let h = 0; h < 24; h++) {
    byHour.set(h, {
      hour: h,
      effectiveness: 0,
      read: 0,
      creation: 0,
      input: 0,
      totalTokens: 0,
    });
  }
  for (const r of rows) {
    const denom = r.read + r.creation + r.input;
    byHour.set(r.hour, {
      hour: r.hour,
      effectiveness: denom === 0 ? 0 : r.read / denom,
      read: r.read,
      creation: r.creation,
      input: r.input,
      totalTokens: r.total,
    });
  }
  return [...byHour.values()];
}

/**
 * Forecast next-24h chargeable tokens by averaging historical (weekday, hour)
 * pairs over the trailing window. Returns 24 hourly buckets starting at the
 * next hour boundary.
 */
export function forecastNext24h(db: DB, windowDays = 30): ForecastNext24h {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT
         CAST(strftime('%w', ts) AS INTEGER) AS weekday,
         CAST(strftime('%H', ts) AS INTEGER) AS hour,
         COALESCE(SUM(input_tokens + cache_creation_tokens), 0) AS chargeable,
         COUNT(DISTINCT date(ts)) AS day_samples
       FROM turns
       WHERE ts >= ?
       GROUP BY weekday, hour`,
    )
    .all(cutoff) as Array<{
      weekday: number;
      hour: number;
      chargeable: number;
      day_samples: number;
    }>;
  const map = new Map<string, { chargeable: number; samples: number }>();
  for (const r of rows) {
    map.set(`${r.weekday}-${r.hour}`, { chargeable: r.chargeable, samples: r.day_samples });
  }

  const now = new Date();
  const startHour = new Date(now.getTime() + 60 * 60 * 1000);
  startHour.setMinutes(0, 0, 0);

  const byHour: Array<{ hour: number; expectedChargeable: number }> = [];
  let total = 0;
  for (let i = 0; i < 24; i++) {
    const t = new Date(startHour.getTime() + i * 3600_000);
    const wd = t.getUTCDay();
    const h = t.getUTCHours();
    const cell = map.get(`${wd}-${h}`);
    const expected = cell && cell.samples > 0 ? cell.chargeable / cell.samples : 0;
    byHour.push({ hour: h, expectedChargeable: Math.round(expected) });
    total += expected;
  }

  return { byHour, totalNext24h: Math.round(total) };
}
