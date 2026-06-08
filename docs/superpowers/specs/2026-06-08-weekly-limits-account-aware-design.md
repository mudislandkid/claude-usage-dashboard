# Weekly Limits — Account-Aware "Honest Single View"

**Date:** 2026-06-08
**Status:** Approved (design), pending implementation plan

## Problem

A user with two Claude Code accounts (switched between when one runs out of
usage) gets **conflicting information** in the `WEEKLY_LIMITS` panel. Two
distinct causes:

1. **Lying header.** The panel sub-header `// reset sun 02:00 utc` is a
   hardcoded string literal (`web/src/components/term-widgets/WeeklyLimits.tsx:24`).
   It is not read from any data. The *real* per-account reset time is already
   present in the data (`bar.resetsAt`) and already renders correctly in the
   ETA line below the bars — so the header contradicts the ETA line, and the
   header is the wrong one. Account A resets Sun 02:00; account B resets ~16:00,
   but the header always claims Sun 02:00.

2. **Account-blind cache.** The OAuth usage cache (`server/src/lib/oauthUsage.ts`)
   is a single file (`~/.claude/usage-dashboard.usage-api.json`) not keyed by
   account. The fetcher throttles to one outbound call per 5 minutes. So right
   after switching accounts, the dashboard keeps showing the **previous
   account's** numbers for up to ~5 minutes with no indication they are stale.

## Constraints (researched, not assumed)

- The weekly numbers come from **either** the OAuth usage endpoint
  (`https://api.anthropic.com/api/oauth/usage`) **or** Claude Code's statusline
  sidecar (`seven_day` field). Both reflect **only the account currently logged
  into Claude Code** — we hold only the active account's OAuth token, and
  Anthropic will not return another account's usage without that account's
  token. **We therefore cannot live-poll both accounts at once.** (This is why
  the chosen scope is a single, correctly-labelled view rather than a
  side-by-side dual view.)
- The statusline sidecar (`~/.claude/usage-dashboard.statusline.json`) carries
  **no account identity** — its keys are `session_id, transcript_path, cwd,
  effort, session_name, model, workspace, version, output_style, cost,
  context_window, exceeds_200k_tokens, fast_mode, thinking, rate_limits`. The
  only account-ish key, `workspace`, is a directory path, not an account.
- `~/.claude.json` **does** contain an `oauthAccount` object with
  `accountUuid`, `emailAddress`, `organizationName` (and more). It is plaintext
  and is **rewritten to the new account the moment you switch** in Claude Code.
  This is the identity source.
- The user's setup uses the **OAuth path** (the usage-api cache file exists and
  is live; the `SONNET_ONLY` bar — which only OAuth can populate — shows data).

## Goals

- The header reset time reflects the **actual** active-account reset, in local
  time, consistent with the ETA line.
- The panel is **labelled with the active account** (full email) so there is no
  ambiguity about whose numbers are shown.
- **No stale cross-account numbers.** After a switch, the previous account's
  cached usage is never presented as current.
- During the brief moment after a switch before fresh data is available, show a
  **refreshing placeholder** rather than a wrong number.

## Non-Goals (YAGNI)

- **No dual / side-by-side account view.** Impossible to do *live* for the
  inactive account (no token), and explicitly out of scope per the scope
  decision.
- **No per-account custom aliases** ("Work" / "Personal"). Raw email is honest
  and unambiguous; aliases can be added later if wanted.
- **No change to the 5-hour window panel.** It has the same latent post-switch
  staleness, but its sidecar refreshes on every prompt so it self-corrects
  quickly. Left untouched.

## Design

### Server

**1. New module `server/src/lib/activeAccount.ts`**

Mirrors the shape/testability of `statusline.ts` and `oauthCredentials.ts`.

```ts
export interface ActiveAccount {
  accountUuid: string;
  email: string;            // oauthAccount.emailAddress
  organizationName: string | null;
}

// Reads ~/.claude.json, returns the currently-logged-in account or null.
// Pure file read + parse; injectable path + reader for tests.
export function readActiveAccount(opts?: {
  path?: string;
  readFile?: (p: string) => string;
}): ActiveAccount | null;
```

- Returns `null` on missing file, parse error, or missing
  `oauthAccount.accountUuid` / `emailAddress`.

**2. `server/src/lib/oauthUsage.ts` — stamp + gate the cache by account**

- `OauthUsage` gains an `accountUuid: string | null` field. Written to the cache
  file and the in-memory cache when a fetch succeeds, stamped with the **active
  account uuid the fetch was performed for**.
- `getUsage` signature gains the active uuid:
  `getUsage({ enabled: boolean; activeAccountUuid: string | null })`.
- Matching helper: `matches(u) = u != null && (activeAccountUuid == null || u.accountUuid === activeAccountUuid)`.
  When `activeAccountUuid` is null (couldn't read identity), fall back to
  best-effort (treat as match) so behaviour is no worse than today.
- Return-path changes:
  - The "fresh enough, return cached" short-circuit only fires when
    `matches(cache.usage)` **and** `cacheAge < refreshMs`. A mismatch (other
    account) fails this test and proceeds to fetch — i.e. **a switch bypasses
    the 5-minute throttle** and refetches immediately.
  - The **error backoff is preserved**: if `cache.lastError` and
    `sinceLastAttempt < backoffMs`, still return without fetching (prevents
    hammering a failing endpoint right after a switch).
  - Any usage returned to the caller is passed through `matches()` — a
    mismatched cache entry is surfaced as `usage: null`, **never** as the other
    account's numbers.
- Because `getUsage` awaits the fetch, the common switch case resolves within
  the same `/weekly` request: mismatch → fetch with the new token → return the
  new account's data. A visible "refreshing" state only occurs on fetch
  error/backoff.

**3. `server/src/api/routes/weekly.ts`**

- Call `readActiveAccount()`; pass `activeAccountUuid` into `getUsage`.
- Add to the response:
  - `account: { email: string; organizationName: string | null } | null`
  - `switching: boolean` — true when OAuth is enabled, credentials are present,
    the active account is known, **and** no account-matching usage is available
    yet (`oauth.usage == null`). This is the signal for the refreshing
    placeholder.
- The statusline fallback is unchanged in mechanism but, since it cannot be
  account-verified, only fills bars when OAuth yields nothing. `account` still
  reflects the active login from `~/.claude.json` for labelling.

### Client

**4. `web/src/hooks/useWeekly.ts`** — extend `WeeklyResponse`:

```ts
account: { email: string; organizationName: string | null } | null;
switching: boolean;
```

**5. `web/src/components/term-widgets/WeeklyLimits.tsx`**

- **Header reset:** replace the hardcoded `// reset sun 02:00 utc` with a value
  derived from `data.allModels?.resetsAt`, formatted in **local** time to match
  the ETA line, e.g. `// reset sun 16:00`. Fall back to `// weekly limits` (or
  similar) when no reset is available.
- **Account label:** show the **full email** in the panel `action`, e.g.
  `greg.herriott@outlook.com · OAUTH`. (Source tag logic unchanged; email
  prepended.)
- **Switching state:** when `data.switching` is true, render
  `refreshing for <email>…` in place of the bars rather than showing stale
  numbers.

## Data Flow

```
/weekly request
  ├─ readActiveAccount()  ──────────────► { accountUuid, email, org } | null   (from ~/.claude.json)
  ├─ fetcher.getUsage({ enabled, activeAccountUuid })
  │     ├─ cache.usage.accountUuid === active?  ── yes & fresh ─► return cached
  │     └─ no (switched) / stale ─► fetch w/ active token ─► stamp accountUuid ─► return
  ├─ statusline fallback (only if OAuth empty; account-unverified)
  └─ response: { allModels, sonnet, claudeDesign, account, switching, oauth }
        │
        ▼
  WeeklyLimits.tsx
   header reset  ◄─ allModels.resetsAt (local time)
   action label  ◄─ account.email + source
   bars OR "refreshing for <email>…"  ◄─ switching
```

## Error Handling

- `~/.claude.json` missing/unreadable → `account = null`, `activeAccountUuid =
  null`; behaviour degrades to today's (best-effort, no account gating). Header
  still uses real `resetsAt`. No crash.
- OAuth fetch error right after a switch → `usage: null`, `switching: true`,
  `oauth.lastError` populated; panel shows the refreshing placeholder (and the
  existing OAuth error line still renders).
- No `resetsAt` in data → header falls back to a neutral label.

## Testing

- `server/tests/activeAccount.test.ts` — parses a fixture `~/.claude.json`,
  returns account; handles missing file / missing `oauthAccount` / bad JSON.
- `server/tests/oauthUsage.test.ts` (extend) —
  - cache stamped with `accountUuid` on successful fetch;
  - same-account + fresh → returns cached without fetching;
  - **account change → bypasses throttle, refetches, returns new account data**;
  - mismatched cache with fetch error → returns `usage: null` (never the other
    account), `lastError` set;
  - error backoff still honoured after a switch.
- `server/tests/api.test.ts` (extend) — `/api/weekly` includes `account` and
  `switching` keys; shape holds with no credentials.

## Decisions (confirmed with user)

- Account label: **full email**.
- Post-switch pre-data state: **refreshing placeholder** (hide bars).
- Scope: **honest single view** (not dual-account, not header-only).
