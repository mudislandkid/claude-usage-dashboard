import type { DB } from '../connection.js';

export interface DashboardSettings {
  windowLimitTokens: number;
  activeWithinDays: number;
  cacheScoreWindowDays: number;
}

const DEFAULTS: DashboardSettings = {
  windowLimitTokens: 220_000,
  activeWithinDays: 14,
  cacheScoreWindowDays: 7,
};

export function getSettings(db: DB): DashboardSettings {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    windowLimitTokens: numOr(map.windowLimitTokens, DEFAULTS.windowLimitTokens),
    activeWithinDays: numOr(map.activeWithinDays, DEFAULTS.activeWithinDays),
    cacheScoreWindowDays: numOr(map.cacheScoreWindowDays, DEFAULTS.cacheScoreWindowDays),
  };
}

export function updateSettings(db: DB, partial: Partial<DashboardSettings>): DashboardSettings {
  const stmt = db.prepare(
    `INSERT INTO settings(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) stmt.run(k, String(v));
  }
  return getSettings(db);
}

function numOr(s: string | undefined, fallback: number): number {
  if (s === undefined) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}
