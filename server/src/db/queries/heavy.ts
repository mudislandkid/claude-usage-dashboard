import type { DB } from '../connection.js';

export interface TtlLeakageStats {
  totalCreation1h: number;
  usefulIn1h: number;
  wastedNoFollowup: number;
  wasted5mSufficient: number;
  leakageRatio: number;
}

export interface ProjectTtlLeakage extends TtlLeakageStats {
  projectPath: string;
  projectName: string;
}

interface CreationRow {
  session_id: string;
  ts: string;
  cache_creation_1h: number;
  next_ts: string | null;
}

function bucketLeakage(rows: CreationRow[]): TtlLeakageStats {
  let useful = 0;
  let wastedNoFollowup = 0;
  let wasted5mSufficient = 0;
  for (const r of rows) {
    const amount = r.cache_creation_1h;
    if (!r.next_ts) {
      wastedNoFollowup += amount;
      continue;
    }
    const gapMin =
      (new Date(r.next_ts).getTime() - new Date(r.ts).getTime()) / 60_000;
    if (gapMin < 5) wasted5mSufficient += amount;
    else if (gapMin <= 60) useful += amount;
    else wastedNoFollowup += amount;
  }
  const total = useful + wastedNoFollowup + wasted5mSufficient;
  return {
    totalCreation1h: total,
    usefulIn1h: useful,
    wastedNoFollowup,
    wasted5mSufficient,
    leakageRatio: total === 0 ? 0 : (wastedNoFollowup + wasted5mSufficient) / total,
  };
}

export function ttlLeakageGlobal(db: DB, days: number): TtlLeakageStats {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT
         t.session_id, t.ts, t.cache_creation_1h,
         (SELECT MIN(t2.ts) FROM turns t2
            WHERE t2.session_id = t.session_id AND t2.ts > t.ts) AS next_ts
       FROM turns t
       WHERE t.ts >= ? AND t.cache_creation_1h > 0`,
    )
    .all(cutoff) as CreationRow[];
  return bucketLeakage(rows);
}

export function ttlLeakageByProject(db: DB, days: number): ProjectTtlLeakage[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT
         s.project_path, s.project_name, t.session_id, t.ts, t.cache_creation_1h,
         (SELECT MIN(t2.ts) FROM turns t2
            WHERE t2.session_id = t.session_id AND t2.ts > t.ts) AS next_ts
       FROM turns t JOIN sessions s ON s.session_id = t.session_id
       WHERE t.ts >= ? AND t.cache_creation_1h > 0`,
    )
    .all(cutoff) as Array<CreationRow & { project_path: string; project_name: string }>;

  const byProject = new Map<string, { name: string; rows: CreationRow[] }>();
  for (const r of rows) {
    let entry = byProject.get(r.project_path);
    if (!entry) {
      entry = { name: r.project_name, rows: [] };
      byProject.set(r.project_path, entry);
    }
    entry.rows.push(r);
  }

  const result: ProjectTtlLeakage[] = [];
  for (const [projectPath, { name, rows: prows }] of byProject) {
    const stats = bucketLeakage(prows);
    if (stats.totalCreation1h === 0) continue;
    result.push({ projectPath, projectName: name, ...stats });
  }
  return result.sort((a, b) => b.leakageRatio - a.leakageRatio);
}

export interface SubSession {
  startTs: string;
  endTs: string;
  durationMinutes: number;
  turns: number;
  totalTokens: number;
  chargeable: number;
}

interface TurnSubsetRow {
  ts: string;
  total: number;
  chargeable: number;
}

/**
 * Break a session into logical sub-sessions by detecting time gaps
 * larger than `gapMinutes`. Default 30 min.
 */
export function logicalSubSessions(
  db: DB,
  sessionId: string,
  gapMinutes = 30,
): SubSession[] {
  const rows = db
    .prepare(
      `SELECT
         ts,
         (input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) AS total,
         (input_tokens + cache_creation_tokens) AS chargeable
       FROM turns WHERE session_id = ? ORDER BY ts ASC`,
    )
    .all(sessionId) as TurnSubsetRow[];
  if (rows.length === 0) return [];
  const gapMs = gapMinutes * 60_000;
  const out: SubSession[] = [];
  let start = rows[0]!.ts;
  let prevTs = rows[0]!.ts;
  let bucket = { turns: 0, total: 0, chargeable: 0 };

  function flush(end: string) {
    out.push({
      startTs: start,
      endTs: end,
      durationMinutes:
        (new Date(end).getTime() - new Date(start).getTime()) / 60_000,
      turns: bucket.turns,
      totalTokens: bucket.total,
      chargeable: bucket.chargeable,
    });
  }

  for (const r of rows) {
    if (new Date(r.ts).getTime() - new Date(prevTs).getTime() > gapMs) {
      flush(prevTs);
      start = r.ts;
      bucket = { turns: 0, total: 0, chargeable: 0 };
    }
    bucket.turns += 1;
    bucket.total += r.total;
    bucket.chargeable += r.chargeable;
    prevTs = r.ts;
  }
  flush(prevTs);
  return out;
}

export interface VersionRow {
  version: string;
  sessionCount: number;
  earliest: string;
  latest: string;
  totalTokens: number;
}

export function versionAdoption(db: DB): VersionRow[] {
  const rows = db
    .prepare(
      `SELECT
         COALESCE(s.version, 'unknown') AS version,
         COUNT(DISTINCT s.session_id) AS session_count,
         MIN(s.first_ts) AS earliest,
         MAX(s.last_ts) AS latest,
         COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS total
       FROM sessions s LEFT JOIN turns t ON t.session_id = s.session_id
       GROUP BY version
       ORDER BY latest DESC`,
    )
    .all() as Array<{
      version: string;
      session_count: number;
      earliest: string;
      latest: string;
      total: number;
    }>;
  return rows.map((r) => ({
    version: r.version,
    sessionCount: r.session_count,
    earliest: r.earliest,
    latest: r.latest,
    totalTokens: r.total,
  }));
}
