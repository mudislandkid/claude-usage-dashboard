import type { DB } from '../connection.js';
import type { PathAlias } from '../../lib/pathAliases.js';

export interface PathAliasRow extends PathAlias {
  createdAt: string;
}

export function listAliases(db: DB): PathAliasRow[] {
  const rows = db
    .prepare(
      `SELECT from_prefix, to_prefix, created_at
       FROM path_aliases
       ORDER BY from_prefix ASC`,
    )
    .all() as Array<{ from_prefix: string; to_prefix: string; created_at: string }>;
  return rows.map((r) => ({
    from: r.from_prefix,
    to: r.to_prefix,
    createdAt: r.created_at,
  }));
}

export function upsertAlias(db: DB, from: string, to: string): void {
  if (!from || !to) throw new Error('alias requires non-empty from/to');
  if (from === to) throw new Error('from and to must differ');
  db.prepare(
    `INSERT INTO path_aliases (from_prefix, to_prefix, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(from_prefix) DO UPDATE SET
       to_prefix = excluded.to_prefix,
       created_at = excluded.created_at`,
  ).run(from, to, new Date().toISOString());
}

export function deleteAlias(db: DB, from: string): void {
  db.prepare('DELETE FROM path_aliases WHERE from_prefix = ?').run(from);
}

/** Distinct project paths actually present in `sessions` — used to expand a canonical to its raw set. */
export function distinctProjectPaths(db: DB): string[] {
  const rows = db
    .prepare('SELECT DISTINCT project_path FROM sessions')
    .all() as Array<{ project_path: string }>;
  return rows.map((r) => r.project_path);
}
