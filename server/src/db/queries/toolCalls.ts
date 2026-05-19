import type { DB } from '../connection.js';
import type { ParsedToolCall } from '../../scanner/parser.js';

export function insertToolCall(db: DB, t: ParsedToolCall): void {
  db.prepare(
    `INSERT INTO tool_calls
       (session_id, message_id, ts, model, tool_name, is_subagent)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(t.sessionId, t.messageId, t.ts, t.model, t.toolName, t.isSubagent ? 1 : 0);
}

export interface ToolUseRow {
  toolName: string;
  count: number;
}

export function toolUseGlobal(db: DB, days: number): ToolUseRow[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT tool_name AS name, COUNT(*) AS n FROM tool_calls
       WHERE ts >= ? GROUP BY tool_name ORDER BY n DESC`,
    )
    .all(cutoff) as Array<{ name: string; n: number }>;
  return rows.map((r) => ({ toolName: r.name, count: r.n }));
}

export function toolUseForProject(
  db: DB,
  projectPaths: string[],
  days: number,
): ToolUseRow[] {
  if (projectPaths.length === 0) return [];
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const placeholders = projectPaths.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT tc.tool_name AS name, COUNT(*) AS n
       FROM tool_calls tc
       JOIN sessions s ON s.session_id = tc.session_id
       WHERE s.project_path IN (${placeholders}) AND tc.ts >= ?
       GROUP BY tc.tool_name ORDER BY n DESC`,
    )
    .all(...projectPaths, cutoff) as Array<{ name: string; n: number }>;
  return rows.map((r) => ({ toolName: r.name, count: r.n }));
}

export interface CompactionStat {
  projectPath: string;
  projectName: string;
  totalTurns: number;
  compactedTurns: number;
  totalIterations: number;
  compactionRate: number;
}

export function compactionByProject(db: DB, days: number): CompactionStat[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT
         s.project_path,
         MAX(s.project_name) AS project_name,
         COUNT(*) AS total_turns,
         SUM(CASE WHEN t.iterations_count > 1 THEN 1 ELSE 0 END) AS compacted,
         SUM(t.iterations_count) AS total_iter
       FROM sessions s JOIN turns t ON t.session_id = s.session_id
       WHERE t.ts >= ?
       GROUP BY s.project_path
       HAVING total_turns >= 50
       ORDER BY (compacted * 1.0 / total_turns) DESC`,
    )
    .all(cutoff) as Array<{
      project_path: string;
      project_name: string;
      total_turns: number;
      compacted: number;
      total_iter: number;
    }>;
  return rows.map((r) => ({
    projectPath: r.project_path,
    projectName: r.project_name,
    totalTurns: r.total_turns,
    compactedTurns: r.compacted,
    totalIterations: r.total_iter,
    compactionRate: r.total_turns === 0 ? 0 : r.compacted / r.total_turns,
  }));
}

export interface ModelRecommendation {
  projectPath: string;
  projectName: string;
  opusToolHeavyTokens: number;
  totalToolHeavyTokens: number;
  opusToolHeavyRatio: number;
  toolCalls: number;
}

const MECHANICAL_TOOLS = new Set(['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob', 'MultiEdit']);

/**
 * Identify projects where Opus was heavily used on mechanical tool work
 * (Edit/Read/Write/Bash/Grep) — strong candidate for offloading to Haiku.
 * Heuristic: count Opus turns whose message contained only mechanical tools.
 */
export function modelRecommendations(db: DB, days: number): ModelRecommendation[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const tools = [...MECHANICAL_TOOLS];
  const placeholders = tools.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT
         s.project_path,
         MAX(s.project_name) AS project_name,
         COUNT(DISTINCT tc.message_id) AS messages_with_mechanical,
         COUNT(*) AS tool_calls,
         SUM(CASE WHEN tc.model LIKE '%opus%' THEN 1 ELSE 0 END) AS opus_tool_calls
       FROM tool_calls tc JOIN sessions s ON s.session_id = tc.session_id
       WHERE tc.ts >= ? AND tc.tool_name IN (${placeholders})
       GROUP BY s.project_path
       HAVING tool_calls >= 100
       ORDER BY opus_tool_calls DESC`,
    )
    .all(cutoff, ...tools) as Array<{
      project_path: string;
      project_name: string;
      tool_calls: number;
      opus_tool_calls: number;
    }>;
  return rows.map((r) => ({
    projectPath: r.project_path,
    projectName: r.project_name,
    opusToolHeavyTokens: r.opus_tool_calls,
    totalToolHeavyTokens: r.tool_calls,
    opusToolHeavyRatio: r.tool_calls === 0 ? 0 : r.opus_tool_calls / r.tool_calls,
    toolCalls: r.tool_calls,
  }));
}
