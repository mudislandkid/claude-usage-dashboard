import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import type { DB } from '../db/connection.js';
import { upsertSession, refreshTurnCount } from '../db/queries/sessions.js';
import { insertTurn } from '../db/queries/turns.js';
import { insertToolCall } from '../db/queries/toolCalls.js';
import { parseLine } from './parser.js';
import { projectNameFromCwd, projectKeyFromCwd } from './projectName.js';
import { isSubagentFile, parentSessionFromPath, topLevelSessionId } from './subagent.js';

export interface ScanResult {
  filesScanned: number;
  filesSkipped: number;
  turnsInserted: number;
  errors: number;
}

interface SessionMeta {
  firstTs: string | null;
  lastTs: string | null;
  entrypoint: string | null;
  version: string | null;
  gitBranch: string | null;
  cwd: string | null;
  primaryModel: string | null;
}

function emptyMeta(): SessionMeta {
  return {
    firstTs: null,
    lastTs: null,
    entrypoint: null,
    version: null,
    gitBranch: null,
    cwd: null,
    primaryModel: null,
  };
}

function modelRank(m: string | null): number {
  if (!m) return 0;
  const s = m.toLowerCase();
  if (s.includes('opus')) return 3;
  if (s.includes('sonnet')) return 2;
  if (s.includes('haiku')) return 1;
  return 0;
}

function* walkJsonl(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkJsonl(p);
    else if (e.isFile() && e.name.endsWith('.jsonl')) yield p;
  }
}

async function scanFile(
  db: DB,
  fp: string,
  skipLines: number,
  result: ScanResult,
): Promise<number> {
  const subagent = isSubagentFile(fp);
  const parentSession = subagent ? parentSessionFromPath(fp) : null;
  const fallbackSessionId =
    (subagent ? path.basename(fp, '.jsonl') : topLevelSessionId(fp)) ?? path.basename(fp, '.jsonl');

  const sessionMeta = new Map<string, SessionMeta>();

  const rl = readline.createInterface({
    input: fs.createReadStream(fp, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let lineNo = 0;
  for await (const raw of rl) {
    lineNo += 1;
    if (lineNo <= skipLines) continue;
    const { turn, toolCalls, meta } = parseLine(raw, { isSubagentFile: subagent });
    const sid = meta.sessionId ?? fallbackSessionId;
    if (turn) {
      try {
        insertTurn(db, { ...turn, sessionId: sid });
        result.turnsInserted += 1;
      } catch {
        result.errors += 1;
      }
    }
    for (const tc of toolCalls) {
      try {
        insertToolCall(db, { ...tc, sessionId: sid });
      } catch {
        result.errors += 1;
      }
    }
    const m = sessionMeta.get(sid) ?? emptyMeta();
    if (turn) {
      if (!m.firstTs || turn.ts < m.firstTs) m.firstTs = turn.ts;
      if (!m.lastTs || turn.ts > m.lastTs) m.lastTs = turn.ts;
      if (modelRank(turn.model) > modelRank(m.primaryModel)) m.primaryModel = turn.model;
    }
    if (meta.entrypoint && !m.entrypoint) m.entrypoint = meta.entrypoint;
    if (meta.version && !m.version) m.version = meta.version;
    if (meta.gitBranch && !m.gitBranch) m.gitBranch = meta.gitBranch;
    if (meta.cwd && !m.cwd) m.cwd = meta.cwd;
    sessionMeta.set(sid, m);
  }

  for (const [sid, m] of sessionMeta) {
    if (!m.firstTs || !m.lastTs) continue;
    upsertSession(db, {
      sessionId: sid,
      projectPath: projectKeyFromCwd(m.cwd),
      projectName: projectNameFromCwd(m.cwd),
      isSubagent: subagent,
      parentSessionId: parentSession,
      firstTs: m.firstTs,
      lastTs: m.lastTs,
      primaryModel: m.primaryModel,
      entrypoint: m.entrypoint,
      version: m.version,
      gitBranch: m.gitBranch,
    });
    refreshTurnCount(db, sid);
  }

  return lineNo;
}

export async function scanAll(db: DB, projectsDir: string): Promise<ScanResult> {
  const result: ScanResult = { filesScanned: 0, filesSkipped: 0, turnsInserted: 0, errors: 0 };
  for (const fp of walkJsonl(projectsDir)) {
    const stat = fs.statSync(fp);
    const prev = db
      .prepare(`SELECT mtime, lines_processed FROM files WHERE path = ?`)
      .get(fp) as { mtime: number; lines_processed: number } | undefined;
    if (prev && prev.mtime === stat.mtimeMs) {
      result.filesSkipped += 1;
      continue;
    }
    const startLine = prev?.lines_processed ?? 0;
    const counted = await scanFile(db, fp, startLine, result);
    db.prepare(
      `INSERT INTO files(path, mtime, size_bytes, lines_processed, last_scanned_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(path) DO UPDATE SET
         mtime = excluded.mtime,
         size_bytes = excluded.size_bytes,
         lines_processed = excluded.lines_processed,
         last_scanned_at = excluded.last_scanned_at`,
    ).run(fp, stat.mtimeMs, stat.size, counted);
    result.filesScanned += 1;
  }
  return result;
}
