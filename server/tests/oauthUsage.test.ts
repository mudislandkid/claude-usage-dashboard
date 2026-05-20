import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOauthUsageFetcher } from '../src/lib/oauthUsage.js';

describe('OauthUsageFetcher', () => {
  let cachePath: string;

  beforeEach(() => {
    cachePath = path.join(os.tmpdir(), `cud-oauth-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(cachePath);
    } catch {
      // ignore
    }
  });

  function makeFetcher(args: {
    fetchImpl: typeof fetch;
    creds?: { accessToken: string; source: 'file' | 'keychain' } | null;
    nowMs?: () => number;
    refreshMs?: number;
    backoffMs?: number;
  }) {
    return createOauthUsageFetcher({
      cachePath,
      endpoint: 'https://test.example/api/oauth/usage',
      refreshIntervalMs: args.refreshMs ?? 5 * 60_000,
      backoffMs: args.backoffMs ?? 5 * 60_000,
      loadCredentials: () =>
        'creds' in args ? args.creds ?? null : { accessToken: 'tok', source: 'file' },
      fetchImpl: args.fetchImpl,
      now: args.nowMs ?? (() => Date.now()),
    });
  }

  it('returns no-creds state when credentials missing', async () => {
    const fetcher = makeFetcher({
      fetchImpl: (async () => new Response(null, { status: 200 })) as unknown as typeof fetch,
      creds: null,
    });
    const r = await fetcher.getUsage({ enabled: true });
    expect(r.credentialsPresent).toBe(false);
    expect(r.lastError).toMatch(/credentials/i);
    expect(r.usage).toBeNull();
  });

  it('respects the disabled flag without making any fetch calls', async () => {
    let calls = 0;
    const fetcher = makeFetcher({
      fetchImpl: (async () => {
        calls += 1;
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    const r = await fetcher.getUsage({ enabled: false });
    expect(calls).toBe(0);
    expect(r.usage).toBeNull();
    expect(r.credentialsPresent).toBe(true);
  });

  it('fetches and parses the OAuth response on first call', async () => {
    const responseBody = {
      five_hour: { utilization: 30, resets_at: '2026-05-05T03:00:00Z' },
      seven_day: { utilization: 33, resets_at: '2026-05-10T07:00:00Z' },
      seven_day_sonnet: { utilization: 6, resets_at: '2026-05-10T07:00:00Z' },
      seven_day_omelette: { utilization: 13, resets_at: '2026-05-10T07:00:00Z' },
    };
    let receivedToken: string | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.Authorization ?? '';
      receivedToken = auth.replace('Bearer ', '');
      return new Response(JSON.stringify(responseBody), { status: 200 });
    }) as unknown as typeof fetch;

    const fetcher = makeFetcher({ fetchImpl });
    const r = await fetcher.getUsage({ enabled: true });
    expect(receivedToken).toBe('tok');
    expect(r.usage?.fiveHourPercent).toBe(30);
    expect(r.usage?.sevenDayPercent).toBe(33);
    expect(r.usage?.sevenDaySonnetPercent).toBe(6);
    expect(r.usage?.sevenDayClaudeDesignPercent).toBe(13);
    expect(r.lastError).toBeNull();
    // Cache file written
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    expect(cached.sevenDayPercent).toBe(33);
  });

  it('serves cached value within refresh interval without re-fetching', async () => {
    let calls = 0;
    const baseTime = 1_000_000;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ seven_day: { utilization: 50, resets_at: '2026-05-10T00:00:00Z' } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    let nowMs = baseTime;
    const fetcher = makeFetcher({
      fetchImpl,
      nowMs: () => nowMs,
      refreshMs: 60_000,
    });
    await fetcher.getUsage({ enabled: true });
    expect(calls).toBe(1);

    nowMs = baseTime + 30_000;
    const r2 = await fetcher.getUsage({ enabled: true });
    expect(calls).toBe(1); // still cached
    expect(r2.usage?.sevenDayPercent).toBe(50);

    nowMs = baseTime + 90_000;
    await fetcher.getUsage({ enabled: true });
    expect(calls).toBe(2); // refreshed
  });

  it('returns last cache + lastError when fetch fails, then backs off', async () => {
    const baseTime = 1_000_000;
    let calls = 0;
    let nowMs = baseTime;
    let shouldFail = false;

    const fetchImpl = (async () => {
      calls += 1;
      if (shouldFail) return new Response('forbidden', { status: 401 });
      return new Response(
        JSON.stringify({ seven_day: { utilization: 25, resets_at: '2026-05-10T00:00:00Z' } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const fetcher = makeFetcher({
      fetchImpl,
      nowMs: () => nowMs,
      refreshMs: 60_000,
      backoffMs: 60_000,
    });
    await fetcher.getUsage({ enabled: true });
    expect(calls).toBe(1);

    // Now fail
    shouldFail = true;
    nowMs = baseTime + 90_000;
    const r2 = await fetcher.getUsage({ enabled: true });
    expect(calls).toBe(2);
    expect(r2.lastError).toMatch(/HTTP 401/);
    expect(r2.usage?.sevenDayPercent).toBe(25); // fall back to last good

    // Within backoff: no retry
    nowMs = baseTime + 100_000;
    await fetcher.getUsage({ enabled: true });
    expect(calls).toBe(2);

    // After backoff: retry
    nowMs = baseTime + 200_000;
    await fetcher.getUsage({ enabled: true });
    expect(calls).toBe(3);
  });

  it('handles partial responses (missing seven_day_sonnet)', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          five_hour: { utilization: 10, resets_at: '2026-05-05T03:00:00Z' },
          seven_day: { utilization: 20, resets_at: '2026-05-10T00:00:00Z' },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const fetcher = makeFetcher({ fetchImpl });
    const r = await fetcher.getUsage({ enabled: true });
    expect(r.usage?.sevenDayPercent).toBe(20);
    expect(r.usage?.sevenDaySonnetPercent).toBeNull();
    expect(r.usage?.sevenDaySonnetResetsAt).toBeNull();
  });
});
