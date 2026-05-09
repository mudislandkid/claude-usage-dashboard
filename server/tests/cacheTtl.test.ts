import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';
import { upsertSession } from '../src/db/queries/sessions.js';
import { insertTurn } from '../src/db/queries/turns.js';
import {
  cacheTtlEfficiency,
  classifyByShadowSimulation,
} from '../src/db/queries/cacheTtl.js';
import type { SessionInsert, Turn } from '../src/types.js';

function baseSession(overrides: Partial<SessionInsert> = {}): SessionInsert {
  return {
    sessionId: 's1',
    projectPath: '/p',
    projectName: 'p',
    isSubagent: false,
    parentSessionId: null,
    firstTs: '2026-05-01T00:00:00Z',
    lastTs: '2026-05-01T00:00:00Z',
    primaryModel: 'claude-opus-4-7',
    entrypoint: null,
    version: null,
    gitBranch: null,
    ...overrides,
  };
}

function turn(overrides: Partial<Turn>): Turn {
  return {
    sessionId: 's1',
    messageId: 'm',
    ts: '2026-05-01T00:00:00Z',
    model: 'claude-opus-4-7',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheCreation5m: 0,
    cacheCreation1h: 0,
    serviceTier: null,
    isSubagent: false,
    iterationsCount: 1,
    ...overrides,
  };
}

const MIN = 60_000;

describe('classifyByShadowSimulation', () => {
  it('marks "stale" when no reads follow the write', () => {
    const r = classifyByShadowSimulation(0, []);
    expect(r.classification).toBe('stale');
    expect(r.firstReadGapMin).toBeNull();
  });

  it('marks "wasted5m" when all reads come within 5 min of each other (5m would survive)', () => {
    // write at T=0; reads every minute. 5m shadow keeps refreshing.
    const reads = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => m * MIN);
    const r = classifyByShadowSimulation(0, reads);
    expect(r.classification).toBe('wasted5m');
    expect(r.firstReadGapMin).toBe(1);
  });

  it('marks "useful" when a gap >5min opens but read still hits within 1h', () => {
    // write at T=0, read at T=2 (refreshes both to T=7 / T=62), read at T=10
    // (5m dead because 10>7, 1h still alive). usefulFor1h=true.
    const reads = [2, 10].map((m) => m * MIN);
    const r = classifyByShadowSimulation(0, reads);
    expect(r.classification).toBe('useful');
  });

  it('continuous interactive cadence with many reads is wasted (the dominant Claude Code pattern)', () => {
    // Reads every 90s for 30 min. 5m shadow stays refreshed throughout.
    const reads: number[] = [];
    for (let t = 1.5 * MIN; t < 30 * MIN; t += 1.5 * MIN) reads.push(t);
    const r = classifyByShadowSimulation(0, reads);
    expect(r.classification).toBe('wasted5m');
  });

  it('marks "stale" when reads only come after the 1h cache has died', () => {
    // 1h cache dies at T=60. First read at T=70.
    const reads = [70 * MIN];
    const r = classifyByShadowSimulation(0, reads);
    expect(r.classification).toBe('stale');
  });

  it('correctly handles the "next turn within 5min then long pause" case the upper-bound mis-classifies', () => {
    // write, read at T=2, read at T=20 (both 5m and 1h would have been
    // refreshed by T=2 to T=7/T=62; at T=20 5m is dead, 1h alive).
    const reads = [2 * MIN, 20 * MIN];
    const r = classifyByShadowSimulation(0, reads);
    // Upper bound (next-turn <5min) would say wasted; we say useful.
    expect(r.classification).toBe('useful');
  });

  it('correctly handles the "many reads in 5-60min window" case the lenient methodology mis-classifies', () => {
    // write, reads every minute for 50 min. Old "any read in 5-60min" would
    // mark useful; the proper sim marks wasted because 5m never died.
    const reads: number[] = [];
    for (let m = 1; m <= 50; m++) reads.push(m * MIN);
    const r = classifyByShadowSimulation(0, reads);
    expect(r.classification).toBe('wasted5m');
  });
});

describe('cacheTtlEfficiency (db integration)', () => {
  it('returns zeros on empty db', () => {
    const db = openDb(':memory:');
    const r = cacheTtlEfficiency(db, 30);
    expect(r.totals.tokens1h).toBe(0);
    expect(r.totals.tokens5m).toBe(0);
    expect(r.classification.usefulTokens).toBe(0);
  });

  it('classifies a 1h write with continuous interactive reads as wasted', () => {
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    const now = new Date();
    insertTurn(
      db,
      turn({ messageId: 'w', ts: now.toISOString(), cacheCreation1h: 1_000_000 }),
    );
    // Reads every 2 minutes for 30 minutes — 5m shadow stays alive
    for (let i = 1; i <= 15; i++) {
      insertTurn(
        db,
        turn({
          messageId: `r${i}`,
          ts: new Date(now.getTime() + i * 2 * MIN).toISOString(),
          cacheReadTokens: 1000,
        }),
      );
    }
    const r = cacheTtlEfficiency(db, 30);
    expect(r.classification.wasted5mTokens).toBe(1_000_000);
    expect(r.classification.usefulTokens).toBe(0);
    // Opus 4.5+ rate: 1M tokens × $5/MTok × 0.75 premium delta = $3.75
    expect(r.cost.totalPremiumUsdSampled).toBeCloseTo(3.75, 2);
  });

  it('classifies a 1h write that survives a >5min gap as useful', () => {
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    const now = new Date();
    insertTurn(
      db,
      turn({ messageId: 'w', ts: now.toISOString(), cacheCreation1h: 500 }),
    );
    insertTurn(
      db,
      turn({
        messageId: 'r1',
        ts: new Date(now.getTime() + 2 * MIN).toISOString(),
        cacheReadTokens: 100,
      }),
    );
    insertTurn(
      db,
      turn({
        messageId: 'r2',
        ts: new Date(now.getTime() + 15 * MIN).toISOString(),
        cacheReadTokens: 100,
      }),
    );
    const r = cacheTtlEfficiency(db, 30);
    expect(r.classification.usefulTokens).toBe(500);
    expect(r.classification.wasted5mTokens).toBe(0);
    expect(r.cost.totalPremiumUsdSampled).toBeCloseTo(0, 2);
  });

  it('classifies a 1h write with no follow-up reads as stale', () => {
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    const now = new Date();
    insertTurn(
      db,
      turn({ messageId: 'w', ts: now.toISOString(), cacheCreation1h: 500 }),
    );
    const r = cacheTtlEfficiency(db, 30);
    expect(r.classification.staleTokens).toBe(500);
  });

  it('totals 5m and 1h volumes separately', () => {
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    const now = new Date();
    insertTurn(
      db,
      turn({
        messageId: 'a',
        ts: now.toISOString(),
        cacheCreation5m: 4000,
        cacheCreation1h: 1000,
      }),
    );
    const r = cacheTtlEfficiency(db, 30);
    expect(r.totals.tokens5m).toBe(4000);
    expect(r.totals.tokens1h).toBe(1000);
    expect(r.totals.share1hByTokens).toBeCloseTo(0.2, 2);
  });

  it('extrapolates monthly premium from sampled window', () => {
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    const now = new Date();
    insertTurn(
      db,
      turn({ messageId: 'w', ts: now.toISOString(), cacheCreation1h: 1_000_000 }),
    );
    // Single read 1 min later → wasted5m
    insertTurn(
      db,
      turn({
        messageId: 'r',
        ts: new Date(now.getTime() + MIN).toISOString(),
        cacheReadTokens: 1,
      }),
    );
    const r15 = cacheTtlEfficiency(db, 15);
    const sampled = r15.cost.totalPremiumUsdSampled;
    expect(r15.cost.totalPremiumUsdMonthly).toBeCloseTo(sampled * 2, 4);
  });
});
