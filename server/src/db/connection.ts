import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL, SCHEMA_VERSION, RESET_SQL } from './schema.js';

export type DB = Database.Database;

export function openDb(dbPath: string): DB {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const current = db.pragma('user_version', { simple: true }) as number;
  if (current < SCHEMA_VERSION) {
    db.exec(RESET_SQL);
  }
  db.exec(SCHEMA_SQL);
  if (current < SCHEMA_VERSION) {
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}
