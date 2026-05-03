import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';
import { upsertSession } from '../src/db/queries/sessions.js';
import { insertTurn, turnsForSession } from '../src/db/queries/turns.js';
import type { SessionInsert, Turn } from '../src/types.js';

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

function baseSession(): SessionInsert {
  return {
    sessionId: 's1',
    projectPath: '/p',
    projectName: 'p',
    isSubagent: false,
    parentSessionId: null,
    firstTs: '2026-05-01T00:00:00Z',
    lastTs: '2026-05-01T00:00:00Z',
    primaryModel: null,
    entrypoint: null,
    version: null,
    gitBranch: null,
  };
}

function baseTurn(): Turn {
  return {
    sessionId: 's1',
    messageId: 'msg_dedup',
    ts: '2026-05-01T00:00:00Z',
    model: 'claude-opus-4-7',
    inputTokens: 1,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5m: 0,
    cacheCreation1h: 0,
    serviceTier: null,
    isSubagent: false,
  };
}

describe('sessions + turns queries', () => {
  it('upsert + insert + read', () => {
    const db = openDb(':memory:');
    upsertSession(db, {
      sessionId: 's1',
      projectPath: '/p',
      projectName: 'p',
      isSubagent: false,
      parentSessionId: null,
      firstTs: '2026-05-01T00:00:00Z',
      lastTs: '2026-05-01T00:00:00Z',
      primaryModel: 'claude-opus-4-7',
      entrypoint: 'claude-vscode',
      version: '2.1.116',
      gitBranch: 'main',
    });
    insertTurn(db, {
      sessionId: 's1',
      messageId: 'msg_1',
      ts: '2026-05-01T00:00:00Z',
      model: 'claude-opus-4-7',
      inputTokens: 6,
      outputTokens: 247,
      cacheReadTokens: 0,
      cacheCreationTokens: 36323,
      cacheCreation5m: 0,
      cacheCreation1h: 36323,
      serviceTier: 'standard',
      isSubagent: false,
    });
    const turns = turnsForSession(db, 's1');
    expect(turns).toHaveLength(1);
    expect(turns[0]?.cacheCreation1h).toBe(36323);
  });

  it('insertTurn dedupes by message_id', () => {
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    const t = baseTurn();
    insertTurn(db, t);
    insertTurn(db, t);
    expect(turnsForSession(db, 's1')).toHaveLength(1);
  });
});
