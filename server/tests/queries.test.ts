import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';

describe('openDb', () => {
  it('opens an in-memory db and creates expected tables', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('sessions');
    expect(names).toContain('turns');
    expect(names).toContain('files');
    expect(names).toContain('settings');
    db.close();
  });
});
