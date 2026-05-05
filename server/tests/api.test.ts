import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';
import { buildApi } from '../src/api/server.js';

describe('api/health', () => {
  it('responds with ok', async () => {
    const db = openDb(':memory:');
    const app = await buildApi({ db, triggerScan: async () => {} });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });
});

describe('GET /api/window', () => {
  it('returns window stats with limit + projection', async () => {
    const db = openDb(':memory:');
    const app = await buildApi({ db, triggerScan: async () => {} });
    const res = await app.inject({ method: 'GET', url: '/api/window' });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.limitTokens).toBeGreaterThan(0);
    // percentUsed may reflect either an empty in-memory DB (0) or a live
    // statusline sidecar on the developer's machine — accept either.
    expect(body.percentUsed).toBeGreaterThanOrEqual(0);
    expect(body.percentUsed).toBeLessThanOrEqual(1);
    expect(body.bridge).toBeDefined();
    await app.close();
  });
});

describe('GET /api/weekly', () => {
  it('returns weekly limits shape with oauth disabled by default', async () => {
    const db = openDb(':memory:');
    const app = await buildApi({ db, triggerScan: async () => {} });
    const res = await app.inject({ method: 'GET', url: '/api/weekly' });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.oauth.enabled).toBe(false);
    // allModels may come from sidecar (statusline) on a developer machine, or be null on CI.
    if (body.allModels !== null) {
      expect(body.allModels.percent).toBeGreaterThanOrEqual(0);
      expect(body.allModels.source).toBeDefined();
    }
    await app.close();
  });
});

describe('settings round-trip', () => {
  it('GET defaults, POST update, GET reflects', async () => {
    const db = openDb(':memory:');
    const app = await buildApi({ db, triggerScan: async () => {} });
    const def = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    expect(def.windowLimitTokens).toBeGreaterThan(0);
    const post = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { windowLimitTokens: 999_999 },
    });
    expect(post.statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    expect(after.windowLimitTokens).toBe(999_999);
    await app.close();
  });
});
