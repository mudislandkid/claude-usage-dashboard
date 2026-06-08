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
