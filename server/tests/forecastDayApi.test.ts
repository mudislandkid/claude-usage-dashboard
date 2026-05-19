import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb } from '../src/db/connection.js';
import { buildApi } from '../src/api/server.js';
import type { Database } from 'better-sqlite3';

describe('GET /api/forecast/day', () => {
  let db: Database;
  beforeEach(() => { db = openDb(':memory:'); });
  afterEach(() => { db.close(); });

  it('returns todays forecast when no date is given', async () => {
    const app = await buildApi({ db, triggerScan: async () => {} });
    const res = await app.inject({ method: 'GET', url: '/api/forecast/day' });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.byHour).toHaveLength(24);
    expect(json.isToday).toBe(true);
    expect(json.source).toBe('snapshot');
    await app.close();
  });

  it('accepts explicit YYYY-MM-DD date', async () => {
    const app = await buildApi({ db, triggerScan: async () => {} });
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const res = await app.inject({ method: 'GET', url: `/api/forecast/day?date=${todayStr}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().date).toBe(todayStr);
    await app.close();
  });

  it('rejects dates outside [today-7, today+1]', async () => {
    const app = await buildApi({ db, triggerScan: async () => {} });
    const res = await app.inject({ method: 'GET', url: '/api/forecast/day?date=2020-01-01' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/range/i);
    await app.close();
  });

  it('rejects malformed date', async () => {
    const app = await buildApi({ db, triggerScan: async () => {} });
    const res = await app.inject({ method: 'GET', url: '/api/forecast/day?date=not-a-date' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
