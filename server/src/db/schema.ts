export const SCHEMA_VERSION = 2;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  mtime REAL NOT NULL,
  size_bytes INTEGER NOT NULL,
  lines_processed INTEGER NOT NULL DEFAULT 0,
  last_scanned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  is_subagent INTEGER NOT NULL DEFAULT 0,
  parent_session_id TEXT,
  first_ts TEXT NOT NULL,
  last_ts TEXT NOT NULL,
  primary_model TEXT,
  entrypoint TEXT,
  version TEXT,
  git_branch TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
CREATE INDEX IF NOT EXISTS idx_sessions_last_ts ON sessions(last_ts);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);

CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_id TEXT,
  ts TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_5m INTEGER NOT NULL DEFAULT 0,
  cache_creation_1h INTEGER NOT NULL DEFAULT 0,
  service_tier TEXT,
  is_subagent INTEGER NOT NULL DEFAULT 0,
  iterations_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_turns_ts ON turns(ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_message_id
  ON turns(message_id) WHERE message_id IS NOT NULL AND message_id != '';

CREATE TABLE IF NOT EXISTS tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_id TEXT,
  ts TEXT NOT NULL,
  model TEXT,
  tool_name TEXT NOT NULL,
  is_subagent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tool_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_name ON tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_ts ON tool_calls(ts);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS path_aliases (
  from_prefix TEXT PRIMARY KEY,
  to_prefix   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aliases_to ON path_aliases(to_prefix);
`;

/**
 * Drop all derived tables and re-run schema. Sessions/turns/tool_calls/files
 * are all rebuildable from the JSONL transcripts, so a wipe is safe — it
 * just triggers a full rescan on next boot.
 */
export const RESET_SQL = `
DROP TABLE IF EXISTS tool_calls;
DROP TABLE IF EXISTS turns;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS files;
`;
