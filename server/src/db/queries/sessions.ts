import type { DB } from '../connection.js';
import type { SessionInsert } from '../../types.js';

export function upsertSession(db: DB, s: SessionInsert): void {
  db.prepare(
    `INSERT INTO sessions
       (session_id, project_path, project_name, is_subagent, parent_session_id,
        first_ts, last_ts, primary_model, entrypoint, version, git_branch, turn_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(session_id) DO UPDATE SET
       project_path = excluded.project_path,
       project_name = excluded.project_name,
       is_subagent = excluded.is_subagent,
       parent_session_id = COALESCE(excluded.parent_session_id, sessions.parent_session_id),
       first_ts = MIN(sessions.first_ts, excluded.first_ts),
       last_ts = MAX(sessions.last_ts, excluded.last_ts),
       primary_model = COALESCE(excluded.primary_model, sessions.primary_model),
       entrypoint = COALESCE(excluded.entrypoint, sessions.entrypoint),
       version = COALESCE(excluded.version, sessions.version),
       git_branch = COALESCE(excluded.git_branch, sessions.git_branch)`,
  ).run(
    s.sessionId,
    s.projectPath,
    s.projectName,
    s.isSubagent ? 1 : 0,
    s.parentSessionId,
    s.firstTs,
    s.lastTs,
    s.primaryModel,
    s.entrypoint,
    s.version,
    s.gitBranch,
  );
}

export function refreshTurnCount(db: DB, sessionId: string): void {
  db.prepare(
    `UPDATE sessions SET turn_count = (
       SELECT COUNT(*) FROM turns WHERE session_id = ?
     ) WHERE session_id = ?`,
  ).run(sessionId, sessionId);
}
