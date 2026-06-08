import fs from 'node:fs';
import { OAUTH_USAGE_CACHE } from '../config.js';
import { loadOauthCredentials, type OauthCredentials } from './oauthCredentials.js';

const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';

// Hard rate limit to avoid spamming an undocumented Anthropic endpoint.
// At most one outbound HTTPS call per REFRESH_INTERVAL_MS, regardless of how
// often the dashboard polls /api/weekly. On HTTP errors we wait an additional
// BACKOFF_AFTER_FAILURE_MS before retrying so a misconfiguration can't loop.
const REFRESH_INTERVAL_MS = 5 * 60_000;
const BACKOFF_AFTER_FAILURE_MS = 5 * 60_000;

/**
 * Undocumented OAuth-token endpoint that the Claude.ai web app uses to
 * populate the "Plan usage limits" page. Returns 5h + 7d + 7d Sonnet
 * utilizations with ISO reset timestamps. Reverse-engineered by the
 * community (e.g. ohugonnot/claude-code-statusline). The `anthropic-beta`
 * header is required.
 */
interface RawUsage {
  five_hour?: { utilization?: number; resets_at?: string };
  seven_day?: { utilization?: number; resets_at?: string };
  seven_day_sonnet?: { utilization?: number; resets_at?: string };
  // Internal Anthropic codename for the "Claude Design" tier shown in the
  // Plan usage limits page.
  seven_day_omelette?: { utilization?: number; resets_at?: string } | null;
}

export interface OauthUsage {
  fiveHourPercent: number | null;
  fiveHourResetsAt: string | null;
  sevenDayPercent: number | null;
  sevenDayResetsAt: string | null;
  sevenDaySonnetPercent: number | null;
  sevenDaySonnetResetsAt: string | null;
  sevenDayClaudeDesignPercent: number | null;
  sevenDayClaudeDesignResetsAt: string | null;
  fetchedAt: string;
  accountUuid: string | null;
}

export interface OauthFetchResult {
  usage: OauthUsage | null;
  ageSeconds: number | null;
  lastError: string | null;
  credentialsPresent: boolean;
  credentialsSource: OauthCredentials['source'] | null;
}

interface CacheState {
  usage: OauthUsage | null;
  lastError: string | null;
  lastAttemptAt: number;
}

interface FetcherDeps {
  endpoint?: string;
  cachePath?: string;
  refreshIntervalMs?: number;
  backoffMs?: number;
  loadCredentials?: typeof loadOauthCredentials;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createOauthUsageFetcher(deps: FetcherDeps = {}) {
  const endpoint = deps.endpoint ?? ENDPOINT;
  const cachePath = deps.cachePath ?? OAUTH_USAGE_CACHE;
  const refreshMs = deps.refreshIntervalMs ?? REFRESH_INTERVAL_MS;
  const backoffMs = deps.backoffMs ?? BACKOFF_AFTER_FAILURE_MS;
  const loadCreds = deps.loadCredentials ?? loadOauthCredentials;
  const doFetch = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());

  const cache: CacheState = {
    usage: readCacheFile(cachePath),
    lastError: null,
    lastAttemptAt: 0,
  };

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
      const fallback = matches(cache.usage) ? cache.usage : null;
      return {
        usage: fallback,
        ageSeconds: ageSec(fallback, now),
        lastError: message,
        credentialsPresent: true,
        credentialsSource: credsSource,
      };
    }
  }

  function reset(): void {
    cache.usage = null;
    cache.lastError = null;
    cache.lastAttemptAt = 0;
  }

  return { getUsage, reset };
}

function pickUsage(
  raw: RawUsage,
  now: () => number,
  activeAccountUuid: string | null,
): OauthUsage {
  return {
    fiveHourPercent: typeof raw.five_hour?.utilization === 'number' ? raw.five_hour.utilization : null,
    fiveHourResetsAt: raw.five_hour?.resets_at ?? null,
    sevenDayPercent: typeof raw.seven_day?.utilization === 'number' ? raw.seven_day.utilization : null,
    sevenDayResetsAt: raw.seven_day?.resets_at ?? null,
    sevenDaySonnetPercent:
      typeof raw.seven_day_sonnet?.utilization === 'number' ? raw.seven_day_sonnet.utilization : null,
    sevenDaySonnetResetsAt: raw.seven_day_sonnet?.resets_at ?? null,
    sevenDayClaudeDesignPercent:
      typeof raw.seven_day_omelette?.utilization === 'number' ? raw.seven_day_omelette.utilization : null,
    sevenDayClaudeDesignResetsAt: raw.seven_day_omelette?.resets_at ?? null,
    fetchedAt: new Date(now()).toISOString(),
    accountUuid: activeAccountUuid,
  };
}

function readCacheFile(path: string): OauthUsage | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (raw && typeof raw.fetchedAt === 'string') return raw as OauthUsage;
  } catch {
    // ignore
  }
  return null;
}

function writeCacheFile(path: string, usage: OauthUsage): void {
  try {
    fs.writeFileSync(path, JSON.stringify(usage, null, 2));
  } catch {
    // ignore disk errors — cache is best-effort
  }
}

function ageSec(usage: OauthUsage | null, now: () => number): number | null {
  if (!usage) return null;
  return Math.max(0, Math.round((now() - new Date(usage.fetchedAt).getTime()) / 1000));
}

let _singleton: ReturnType<typeof createOauthUsageFetcher> | null = null;
export function getOauthUsageFetcher(): ReturnType<typeof createOauthUsageFetcher> {
  if (_singleton === null) _singleton = createOauthUsageFetcher();
  return _singleton;
}
