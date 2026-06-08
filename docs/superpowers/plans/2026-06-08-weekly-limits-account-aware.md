# Weekly Limits Account-Aware "Honest Single View" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `WEEKLY_LIMITS` panel show a single, correctly-labelled account's real reset time, and never display the previous account's stale numbers after switching Claude Code accounts.

**Architecture:** The active account identity is read live from `~/.claude.json` (`oauthAccount`). The OAuth usage cache is stamped with the account UUID it was fetched for; the fetcher only serves usage matching the active account, and a switch bypasses the refresh throttle to refetch immediately. The route exposes `account` + `switching`; the panel derives its header reset from real data, labels the active account by email, and shows a "refreshing" placeholder during the brief post-switch gap.

**Tech Stack:** TypeScript, Fastify (server), React + Vite (web), Vitest (tests). Monorepo workspaces: `server`, `web`.

**Spec:** `docs/superpowers/specs/2026-06-08-weekly-limits-account-aware-design.md`

---

## File Structure

**Create:**
- `server/src/lib/activeAccount.ts` — reads `~/.claude.json`, returns the active account identity. One responsibility: identity.
- `server/tests/activeAccount.test.ts` — unit tests for the above.

**Modify:**
- `server/src/config.ts` — add `CLAUDE_CONFIG_FILE` path constant.
- `server/src/lib/oauthUsage.ts` — stamp/gate cache by `accountUuid`.
- `server/tests/oauthUsage.test.ts` — add account-aware tests.
- `server/src/api/routes/weekly.ts` — wire in active account, expose `account` + `switching`.
- `server/tests/api.test.ts` — assert new weekly fields.
- `web/src/lib/format.ts` — add `formatResetHeader`.
- `web/tests/format.test.ts` — test `formatResetHeader`.
- `web/src/hooks/useWeekly.ts` — extend `WeeklyResponse` types.
- `web/src/components/term-widgets/WeeklyLimits.tsx` — real header reset, account label, switching placeholder.

---

## Task 1: Active account identity module

**Files:**
- Modify: `server/src/config.ts`
- Create: `server/src/lib/activeAccount.ts`
- Test: `server/tests/activeAccount.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/activeAccount.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readActiveAccount } from '../src/lib/activeAccount.js';

describe('readActiveAccount', () => {
  const good = JSON.stringify({
    oauthAccount: {
      accountUuid: 'uuid-123',
      emailAddress: 'greg@example.com',
      organizationName: 'Ice Point Labs',
    },
  });

  it('parses the active account', () => {
    const a = readActiveAccount({ path: '/x', readFile: () => good });
    expect(a).toEqual({
      accountUuid: 'uuid-123',
      email: 'greg@example.com',
      organizationName: 'Ice Point Labs',
    });
  });

  it('returns null when the file is missing', () => {
    const a = readActiveAccount({
      path: '/x',
      readFile: () => {
        throw new Error('ENOENT');
      },
    });
    expect(a).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    const a = readActiveAccount({ path: '/x', readFile: () => '{not json' });
    expect(a).toBeNull();
  });

  it('returns null when oauthAccount is absent', () => {
    const a = readActiveAccount({ path: '/x', readFile: () => '{"userID":"z"}' });
    expect(a).toBeNull();
  });

  it('returns null when accountUuid or email is missing', () => {
    const a = readActiveAccount({
      path: '/x',
      readFile: () => JSON.stringify({ oauthAccount: { emailAddress: 'g@x.com' } }),
    });
    expect(a).toBeNull();
  });

  it('tolerates a missing organizationName', () => {
    const a = readActiveAccount({
      path: '/x',
      readFile: () =>
        JSON.stringify({ oauthAccount: { accountUuid: 'u', emailAddress: 'g@x.com' } }),
    });
    expect(a?.organizationName).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w server -- activeAccount`
Expected: FAIL — cannot find module `../src/lib/activeAccount.js`.

- [ ] **Step 3: Add the config constant**

In `server/src/config.ts`, add after the `OAUTH_KEYCHAIN_SERVICE` line (line 9):

```ts
export const CLAUDE_CONFIG_FILE = path.join(os.homedir(), '.claude.json');
```

- [ ] **Step 4: Implement the module**

Create `server/src/lib/activeAccount.ts`:

```ts
import fs from 'node:fs';
import { CLAUDE_CONFIG_FILE } from '../config.js';

/**
 * The Claude Code account currently logged in, read from ~/.claude.json's
 * `oauthAccount` block. This file is rewritten to the new account the moment
 * the user switches accounts, so it is the reliable source of "who am I right
 * now" — the statusline sidecar carries no account identity.
 */
export interface ActiveAccount {
  accountUuid: string;
  email: string;
  organizationName: string | null;
}

export function readActiveAccount(opts?: {
  path?: string;
  readFile?: (p: string) => string;
}): ActiveAccount | null {
  const filePath = opts?.path ?? CLAUDE_CONFIG_FILE;
  const readFile = opts?.readFile ?? ((p: string) => fs.readFileSync(p, 'utf8'));

  let raw: string;
  try {
    raw = readFile(filePath);
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const acct = (parsed as { oauthAccount?: unknown })?.oauthAccount;
  if (!acct || typeof acct !== 'object') return null;
  const a = acct as Record<string, unknown>;

  const accountUuid = typeof a.accountUuid === 'string' ? a.accountUuid : null;
  const email = typeof a.emailAddress === 'string' ? a.emailAddress : null;
  if (!accountUuid || !email) return null;

  const organizationName =
    typeof a.organizationName === 'string' ? a.organizationName : null;

  return { accountUuid, email, organizationName };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w server -- activeAccount`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/config.ts server/src/lib/activeAccount.ts server/tests/activeAccount.test.ts
git commit -m "feat(weekly): read active Claude Code account from ~/.claude.json"
```

---

## Task 2: Account-key the OAuth usage cache

**Files:**
- Modify: `server/src/lib/oauthUsage.ts`
- Test: `server/tests/oauthUsage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these tests inside the `describe('OauthUsageFetcher', …)` block in `server/tests/oauthUsage.test.ts` (before its closing `});`):

```ts
  it('stamps the cache with the active account uuid', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ seven_day: { utilization: 40, resets_at: '2026-05-10T00:00:00Z' } }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const fetcher = makeFetcher({ fetchImpl });
    const r = await fetcher.getUsage({ enabled: true, activeAccountUuid: 'acct-A' });
    expect(r.usage?.accountUuid).toBe('acct-A');
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    expect(cached.accountUuid).toBe('acct-A');
  });

  it('refetches immediately on account change, bypassing the refresh throttle', async () => {
    let calls = 0;
    let body = { seven_day: { utilization: 40, resets_at: '2026-05-10T00:00:00Z' } };
    const baseTime = 1_000_000;
    let nowMs = baseTime;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const fetcher = makeFetcher({ fetchImpl, nowMs: () => nowMs, refreshMs: 60_000 });

    await fetcher.getUsage({ enabled: true, activeAccountUuid: 'acct-A' });
    expect(calls).toBe(1);

    // Same account, well within the refresh window -> served from cache.
    nowMs = baseTime + 1_000;
    await fetcher.getUsage({ enabled: true, activeAccountUuid: 'acct-A' });
    expect(calls).toBe(1);

    // Switched account, still within the refresh window -> immediate refetch.
    body = { seven_day: { utilization: 7, resets_at: '2026-05-12T00:00:00Z' } };
    nowMs = baseTime + 2_000;
    const r = await fetcher.getUsage({ enabled: true, activeAccountUuid: 'acct-B' });
    expect(calls).toBe(2);
    expect(r.usage?.sevenDayPercent).toBe(7);
    expect(r.usage?.accountUuid).toBe('acct-B');
  });

  it('never surfaces the other account on a post-switch fetch error', async () => {
    let shouldFail = false;
    const baseTime = 1_000_000;
    let nowMs = baseTime;
    const fetchImpl = (async () => {
      if (shouldFail) return new Response('nope', { status: 401 });
      return new Response(
        JSON.stringify({ seven_day: { utilization: 55, resets_at: '2026-05-10T00:00:00Z' } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const fetcher = makeFetcher({
      fetchImpl,
      nowMs: () => nowMs,
      refreshMs: 60_000,
      backoffMs: 60_000,
    });

    await fetcher.getUsage({ enabled: true, activeAccountUuid: 'acct-A' });

    // Switch to B; B's fetch fails -> must NOT fall back to A's numbers.
    shouldFail = true;
    nowMs = baseTime + 1_000;
    const r = await fetcher.getUsage({ enabled: true, activeAccountUuid: 'acct-B' });
    expect(r.lastError).toMatch(/HTTP 401/);
    expect(r.usage).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w server -- oauthUsage`
Expected: FAIL — `getUsage` does not accept `activeAccountUuid`; `accountUuid` is undefined on usage.

- [ ] **Step 3: Add `accountUuid` to the `OauthUsage` interface**

In `server/src/lib/oauthUsage.ts`, add to the `OauthUsage` interface (after `fetchedAt: string;`):

```ts
  accountUuid: string | null;
```

- [ ] **Step 4: Stamp the account in `pickUsage`**

Replace the `pickUsage` signature and its `fetchedAt` line. Change the signature from:

```ts
function pickUsage(raw: RawUsage, now: () => number): OauthUsage {
```

to:

```ts
function pickUsage(
  raw: RawUsage,
  now: () => number,
  activeAccountUuid: string | null,
): OauthUsage {
```

and change the final field from:

```ts
    fetchedAt: new Date(now()).toISOString(),
```

to:

```ts
    fetchedAt: new Date(now()).toISOString(),
    accountUuid: activeAccountUuid,
```

- [ ] **Step 5: Gate `getUsage` by active account**

Replace the entire `getUsage` function body in `server/src/lib/oauthUsage.ts` with:

```ts
  async function getUsage(opts: {
    enabled: boolean;
    activeAccountUuid?: string | null;
  }): Promise<OauthFetchResult> {
    const activeUuid = opts.activeAccountUuid ?? null;
    // Usage only "belongs" to the caller if its stamped account matches the
    // active one. When we can't determine the active account (null), fall back
    // to best-effort (treat as a match) so behaviour is no worse than before.
    const matches = (u: OauthUsage | null): boolean =>
      u !== null && (activeUuid === null || u.accountUuid === activeUuid);
    const safeUsage = matches(cache.usage) ? cache.usage : null;

    const creds = loadCreds();
    const credsSource = creds?.source ?? null;

    if (!creds) {
      return {
        usage: safeUsage,
        ageSeconds: ageSec(safeUsage, now),
        lastError: 'No Claude Code credentials found',
        credentialsPresent: false,
        credentialsSource: null,
      };
    }
    if (!opts.enabled) {
      return {
        usage: null,
        ageSeconds: null,
        lastError: null,
        credentialsPresent: true,
        credentialsSource: credsSource,
      };
    }

    const accountMatches = matches(cache.usage);
    const cacheAge = cache.usage
      ? now() - new Date(cache.usage.fetchedAt).getTime()
      : Infinity;
    const sinceLastAttempt = now() - cache.lastAttemptAt;

    // Fresh AND same account -> serve cache. An account switch fails this test
    // and falls through to an immediate refetch (throttle bypassed).
    if (accountMatches && cacheAge < refreshMs) {
      return {
        usage: safeUsage,
        ageSeconds: ageSec(safeUsage, now),
        lastError: cache.lastError,
        credentialsPresent: true,
        credentialsSource: credsSource,
      };
    }
    // Error backoff still applies (even across a switch) so a failing endpoint
    // can't be hammered. safeUsage is null on mismatch, so we never leak the
    // other account here either.
    if (cache.lastError && sinceLastAttempt < backoffMs) {
      return {
        usage: safeUsage,
        ageSeconds: ageSec(safeUsage, now),
        lastError: cache.lastError,
        credentialsPresent: true,
        credentialsSource: credsSource,
      };
    }

    cache.lastAttemptAt = now();
    try {
      const r = await doFetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'Content-Type': 'application/json',
        },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw = (await r.json()) as RawUsage;
      const usage = pickUsage(raw, now, activeUuid);
      cache.usage = usage;
      cache.lastError = null;
      writeCacheFile(cachePath, usage);
      return {
        usage,
        ageSeconds: 0,
        lastError: null,
        credentialsPresent: true,
        credentialsSource: credsSource,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      cache.lastError = message;
      return {
        usage: matches(cache.usage) ? cache.usage : null,
        ageSeconds: ageSec(matches(cache.usage) ? cache.usage : null, now),
        lastError: message,
        credentialsPresent: true,
        credentialsSource: credsSource,
      };
    }
  }
```

- [ ] **Step 6: Run the full oauthUsage suite to verify all pass**

Run: `npm test -w server -- oauthUsage`
Expected: PASS — all existing tests (which call `getUsage({ enabled })` with no uuid → `activeUuid` null → best-effort match) plus the 3 new ones.

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/oauthUsage.ts server/tests/oauthUsage.test.ts
git commit -m "feat(weekly): account-key OAuth usage cache, refetch on account switch"
```

---

## Task 3: Weekly route exposes account + switching

**Files:**
- Modify: `server/src/api/routes/weekly.ts`
- Test: `server/tests/api.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `it` inside the `describe('GET /api/weekly', …)` block in `server/tests/api.test.ts` (after the existing test, before the block's closing `});`):

```ts
  it('includes account + switching fields', async () => {
    const db = openDb(':memory:');
    const app = await buildApi({ db, triggerScan: async () => {} });
    const body = (await app.inject({ method: 'GET', url: '/api/weekly' })).json();
    expect('account' in body).toBe(true); // null on CI, object on a logged-in machine
    expect(typeof body.switching).toBe('boolean');
    await app.close();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w server -- api.test`
Expected: FAIL — `body.switching` is `undefined` (not a boolean).

- [ ] **Step 3: Wire the active account into the route**

In `server/src/api/routes/weekly.ts`, add this import after the existing imports (after the `buildHourOfWeekProfile` import on line 7):

```ts
import { readActiveAccount } from '../../lib/activeAccount.js';
```

Then, inside the `app.get('/weekly', …)` handler, change the OAuth fetch line. Replace:

```ts
    const statusline = readStatuslineSidecar();
    const fetcher = getOauthUsageFetcher();
    const oauth = await fetcher.getUsage({ enabled: settings.oauthUsageEnabled });
```

with:

```ts
    const statusline = readStatuslineSidecar();
    const account = readActiveAccount();
    const fetcher = getOauthUsageFetcher();
    const oauth = await fetcher.getUsage({
      enabled: settings.oauthUsageEnabled,
      activeAccountUuid: account?.accountUuid ?? null,
    });
```

- [ ] **Step 4: Compute `switching` and extend the response**

In the same file, replace the final `return { … }` object. Change from:

```ts
    return {
      allModels,
      sonnet,
      claudeDesign,
      oauth: {
        enabled: settings.oauthUsageEnabled,
        credentialsPresent: oauth.credentialsPresent,
        credentialsSource: oauth.credentialsSource,
        ageSeconds: oauth.ageSeconds,
        lastError: oauth.lastError,
        fetchedAt: oauth.usage?.fetchedAt ?? null,
      },
    };
```

to:

```ts
    // "switching": OAuth is the intended source and we know who's logged in,
    // but no account-matching usage is available yet (just switched, or the
    // refetch errored). The UI shows a refreshing placeholder instead of the
    // other account's stale numbers.
    const switching =
      settings.oauthUsageEnabled &&
      oauth.credentialsPresent &&
      account !== null &&
      oauth.usage === null;

    return {
      allModels,
      sonnet,
      claudeDesign,
      account: account
        ? { email: account.email, organizationName: account.organizationName }
        : null,
      switching,
      oauth: {
        enabled: settings.oauthUsageEnabled,
        credentialsPresent: oauth.credentialsPresent,
        credentialsSource: oauth.credentialsSource,
        ageSeconds: oauth.ageSeconds,
        lastError: oauth.lastError,
        fetchedAt: oauth.usage?.fetchedAt ?? null,
      },
    };
```

- [ ] **Step 5: Run the full server suite to verify all pass**

Run: `npm test -w server`
Expected: PASS (all suites; the new `/api/weekly` assertions included).

- [ ] **Step 6: Commit**

```bash
git add server/src/api/routes/weekly.ts server/tests/api.test.ts
git commit -m "feat(weekly): expose active account + switching state from /api/weekly"
```

---

## Task 4: `formatResetHeader` helper (web)

**Files:**
- Modify: `web/src/lib/format.ts`
- Test: `web/tests/format.test.ts`

- [ ] **Step 1: Write the failing test**

In `web/tests/format.test.ts`, update the import line to include the new helper:

```ts
import { formatTokens, formatPercent, formatRelative, formatDuration, formatResetHeader } from '../src/lib/format';
```

and add this `it` inside the `describe('format', …)` block (before its closing `});`):

```ts
  it('reset header', () => {
    expect(formatResetHeader(null)).toBe('—');
    expect(formatResetHeader('not-a-date')).toBe('—');
    // local-timezone-independent shape check: "sun 16:00"
    expect(formatResetHeader('2026-06-14T12:00:00Z')).toMatch(/^[a-z]{3} \d{2}:\d{2}$/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w web -- format`
Expected: FAIL — `formatResetHeader` is not exported.

- [ ] **Step 3: Implement the helper**

Append to `web/src/lib/format.ts`:

```ts
/**
 * Short weekday + 24h local time for the weekly-limits header, e.g. "sun 16:00".
 * Local time matches the per-bar ETA line so the two never contradict.
 */
export function formatResetHeader(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.toLocaleDateString([], { weekday: 'short' }).toLowerCase();
  const time = d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${day} ${time}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w web -- format`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/format.ts web/tests/format.test.ts
git commit -m "feat(weekly): add formatResetHeader helper"
```

---

## Task 5: Wire account-awareness into the panel

**Files:**
- Modify: `web/src/hooks/useWeekly.ts`
- Modify: `web/src/components/term-widgets/WeeklyLimits.tsx`

- [ ] **Step 1: Extend the `WeeklyResponse` type**

In `web/src/hooks/useWeekly.ts`, add two fields to the `WeeklyResponse` interface, immediately after `claudeDesign: WeeklyBar | null;`:

```ts
  account: { email: string; organizationName: string | null } | null;
  switching: boolean;
```

- [ ] **Step 2: Import the helper in the panel**

In `web/src/components/term-widgets/WeeklyLimits.tsx`, update the format import (currently `import { useWeekly, type WeeklyBar } from '@/hooks/useWeekly';` is line 3; the component does not yet import from `@/lib/format`). Add this import after line 3:

```ts
import { formatResetHeader } from '@/lib/format';
```

- [ ] **Step 3: Derive header, account label, and switching in the component body**

In `WeeklyLimitsPanel`, replace the block that computes `sourceTag` and the opening `<TPanel …>` props. Change from:

```ts
  const sourceTag = data.oauth.enabled && data.oauth.credentialsPresent
    ? fetched
      ? `OAUTH · ${fetched.toUpperCase()}`
      : 'OAUTH'
    : 'STATUSLINE';

  return (
    <TPanel
      title="WEEKLY_LIMITS"
      sub="// reset sun 02:00 utc"
      action={sourceTag}
    >
```

to:

```ts
  const sourceTag = data.oauth.enabled && data.oauth.credentialsPresent
    ? fetched
      ? `OAUTH · ${fetched.toUpperCase()}`
      : 'OAUTH'
    : 'STATUSLINE';

  const email = data.account?.email ?? null;
  const action = email ? `${email} · ${sourceTag}` : sourceTag;

  const resetIso = data.allModels?.resetsAt ?? null;
  const sub = resetIso ? `// reset ${formatResetHeader(resetIso)}` : '// weekly limits';

  if (data.switching) {
    return (
      <TPanel title="WEEKLY_LIMITS" sub={sub} action={action}>
        <div
          style={{
            fontFamily: TT_MONO,
            fontSize: 12,
            color: TT.textMute,
            padding: '18px 0',
          }}
        >
          ▸ refreshing for{' '}
          <span style={{ color: TT.green }}>{email ?? 'account'}</span>…
        </div>
      </TPanel>
    );
  }

  return (
    <TPanel title="WEEKLY_LIMITS" sub={sub} action={action}>
```

(The existing `</TPanel>` close and the rows in between are unchanged.)

- [ ] **Step 4: Typecheck + build the web app**

Run: `npm run build -w web`
Expected: PASS — `tsc -p . --noEmit` then `vite build` complete with no type errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useWeekly.ts web/src/components/term-widgets/WeeklyLimits.tsx
git commit -m "feat(weekly): real header reset, account label, switching placeholder"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS — server and web suites, including the new `activeAccount`, account-aware `oauthUsage`, `/api/weekly`, and `formatResetHeader` tests.

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: PASS — server `tsc`, web `tsc --noEmit` + `vite build`, no errors.

- [ ] **Step 3: Manual check (user starts the dev server)**

Ask the user to start the dev server (do not start it yourself) and confirm in the `WEEKLY_LIMITS` panel:
1. The header shows the **real** reset time (e.g. `// reset sun 16:00`), matching the ETA line — not the old hardcoded `sun 02:00 utc`.
2. The panel action shows the **active account email** (e.g. `greg.herriott@outlook.com · OAUTH`).
3. After switching the Claude Code account and submitting a prompt on the new account, the panel updates to the new account's numbers within one poll (≤60s) and never shows the previous account's bars. If the post-switch refetch errors, it shows `▸ refreshing for <email>…` instead of stale bars.

- [ ] **Step 4: Final state**

All tasks committed. No further commit needed unless Step 3 surfaces a fix.

---

## Self-Review Notes

- **Spec coverage:** header reset (Task 4/5), account label (Task 5), account-keyed cache / no stale cross-account numbers (Task 2), switching placeholder (Task 3/5), identity from `~/.claude.json` (Task 1), tests for all (Tasks 1–4). 5h panel + aliases are explicit non-goals — no tasks, by design.
- **Type consistency:** `ActiveAccount.{accountUuid,email,organizationName}` defined in Task 1 used verbatim in Task 3; `OauthUsage.accountUuid` defined in Task 2 used in the `matches`/`pickUsage` logic; route response `{ account:{email,organizationName}, switching }` defined in Task 3 matches `WeeklyResponse` additions in Task 5; `formatResetHeader` signature identical across Task 4 and Task 5.
- **No placeholders:** every code step shows complete code and exact run commands.
