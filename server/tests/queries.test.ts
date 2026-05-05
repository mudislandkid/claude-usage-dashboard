import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';
import { upsertSession } from '../src/db/queries/sessions.js';
import { insertTurn, turnsForSession } from '../src/db/queries/turns.js';
import { listProjects } from '../src/db/queries/projects.js';
import { overallCacheScore } from '../src/db/queries/cache.js';
import { classifyModel } from '../src/db/queries/modelMix.js';
import { getSettings, updateSettings } from '../src/db/queries/settings.js';
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
    iterationsCount: 1,
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
      iterationsCount: 1,
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

describe('aggregate queries', () => {
  it('classifyModel handles known + unknown', () => {
    expect(classifyModel('claude-opus-4-7')).toBe('opus');
    expect(classifyModel('claude-haiku-4-5-20251001')).toBe('haiku');
    expect(classifyModel('something-else')).toBe('other');
    expect(classifyModel(null)).toBe('other');
  });

  it('overallCacheScore computes ratio', () => {
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    insertTurn(db, {
      ...baseTurn(),
      messageId: 'a',
      cacheReadTokens: 80,
      cacheCreationTokens: 10,
      inputTokens: 10,
    });
    const score = overallCacheScore(db, 365);
    expect(score.effectiveness).toBeCloseTo(0.8, 2);
  });

  it('listProjects flags active vs abandoned', () => {
    const db = openDb(':memory:');
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    upsertSession(db, {
      ...baseSession(),
      sessionId: 'recent',
      projectPath: '/r',
      projectName: 'r',
      firstTs: recent,
      lastTs: recent,
    });
    upsertSession(db, {
      ...baseSession(),
      sessionId: 'old',
      projectPath: '/o',
      projectName: 'o',
      firstTs: old,
      lastTs: old,
    });
    const projects = listProjects(db, 14);
    const recentP = projects.find((p) => p.projectPath === '/r');
    const oldP = projects.find((p) => p.projectPath === '/o');
    expect(recentP?.isActive).toBe(true);
    expect(oldP?.isActive).toBe(false);
  });
});

describe('fiveHourWindow (anchored)', () => {
  it('anchors to top-of-hour of first turn after a >=5h gap', async () => {
    const { fiveHourWindow } = await import('../src/db/queries/window.js');
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    // Old activity, then a long idle, then a turn at 18:13 → window 18:00-23:00.
    insertTurn(db, { ...baseTurn(), messageId: 'old', ts: '2026-05-01T10:00:00Z' });
    insertTurn(db, {
      ...baseTurn(),
      messageId: 'first',
      ts: '2026-05-01T18:13:00Z',
      inputTokens: 1000,
      cacheCreationTokens: 500,
    });
    insertTurn(db, {
      ...baseTurn(),
      messageId: 'second',
      ts: '2026-05-01T19:00:00Z',
      inputTokens: 2000,
      cacheCreationTokens: 0,
    });
    const now = new Date('2026-05-01T19:30:00Z');
    const w = fiveHourWindow(db, now);
    expect(w.windowActive).toBe(true);
    expect(w.windowStart).toBe('2026-05-01T18:00:00.000Z');
    expect(w.windowEnd).toBe('2026-05-01T23:00:00.000Z');
    expect(w.totalChargeable).toBe(3500); // 1000+500+2000
  });

  it('opens a new window when a turn falls past the previous windowEnd', async () => {
    const { fiveHourWindow } = await import('../src/db/queries/window.js');
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    // Anchor #1: 10:00, ends 15:00. A turn at 15:30 starts anchor #2 at 15:00, ends 20:00.
    insertTurn(db, { ...baseTurn(), messageId: 'a', ts: '2026-05-01T10:05:00Z', inputTokens: 1000 });
    insertTurn(db, { ...baseTurn(), messageId: 'b', ts: '2026-05-01T15:30:00Z', inputTokens: 2000 });
    const now = new Date('2026-05-01T16:00:00Z');
    const w = fiveHourWindow(db, now);
    expect(w.windowStart).toBe('2026-05-01T15:00:00.000Z');
    expect(w.windowEnd).toBe('2026-05-01T20:00:00.000Z');
    expect(w.totalChargeable).toBe(2000); // only the second turn falls inside
  });

  it('reports inactive when most recent windowEnd has passed', async () => {
    const { fiveHourWindow } = await import('../src/db/queries/window.js');
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    insertTurn(db, { ...baseTurn(), messageId: 'a', ts: '2026-05-01T10:00:00Z', inputTokens: 1000 });
    const now = new Date('2026-05-01T15:30:00Z'); // past 15:00 windowEnd
    const w = fiveHourWindow(db, now);
    expect(w.windowActive).toBe(false);
    expect(w.windowStart).toBeNull();
    expect(w.totalChargeable).toBe(0);
  });

  it('returns inactive on empty db', async () => {
    const { fiveHourWindow } = await import('../src/db/queries/window.js');
    const db = openDb(':memory:');
    const w = fiveHourWindow(db, new Date('2026-05-01T12:00:00Z'));
    expect(w.windowActive).toBe(false);
    expect(w.totalChargeable).toBe(0);
    expect(w.burnRatePerMin).toBe(0);
  });
});

describe('peakWindow', () => {
  it('computes p95/p99/max across rolling 5h windows', async () => {
    const { peakWindow } = await import('../src/db/queries/window.js');
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    const now = Date.now();
    for (let i = 0; i < 100; i++) {
      const ts = new Date(now - i * 60_000).toISOString();
      insertTurn(db, {
        ...baseTurn(),
        messageId: `m-${i}`,
        ts,
        inputTokens: 1000,
        cacheCreationTokens: 0,
      });
    }
    const r = peakWindow(db, 30);
    expect(r.samples).toBe(100);
    expect(r.max).toBeGreaterThan(0);
    expect(r.p95).toBeGreaterThan(0);
    expect(r.p99).toBeGreaterThanOrEqual(r.p95);
  });

  it('returns zeros for empty db', async () => {
    const { peakWindow } = await import('../src/db/queries/window.js');
    const db = openDb(':memory:');
    const r = peakWindow(db, 30);
    expect(r.samples).toBe(0);
    expect(r.max).toBe(0);
  });
});

describe('settings', () => {
  it('returns defaults if empty', () => {
    const db = openDb(':memory:');
    const s = getSettings(db);
    expect(s.windowLimitTokens).toBeGreaterThan(0);
    expect(s.activeWithinDays).toBe(14);
  });

  it('updates and persists', () => {
    const db = openDb(':memory:');
    updateSettings(db, { windowLimitTokens: 500_000 });
    expect(getSettings(db).windowLimitTokens).toBe(500_000);
  });
});
