import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { OAUTH_CREDENTIALS_FILE, OAUTH_KEYCHAIN_SERVICE } from '../config.js';

export interface OauthCredentials {
  accessToken: string;
  source: 'file' | 'keychain';
}

/**
 * Loads the Claude Code OAuth access token. Linux/WSL keep it in
 * `~/.claude/.credentials.json`; macOS stores it in the login keychain under
 * the service name `Claude Code-credentials`. We try the file first (cheap,
 * no permissions prompt) and fall back to keychain on darwin.
 *
 * Note: the first keychain access prompts the user to allow the dashboard
 * binary to read the secret. They can click "Always Allow" to silence
 * subsequent reads.
 */
export function loadOauthCredentials(opts?: {
  filePath?: string;
  keychainService?: string;
  platform?: NodeJS.Platform;
  username?: string;
  exec?: typeof execFileSync;
  readFile?: (p: string) => string;
  exists?: (p: string) => boolean;
}): OauthCredentials | null {
  const filePath = opts?.filePath ?? OAUTH_CREDENTIALS_FILE;
  const platform = opts?.platform ?? process.platform;
  const username = opts?.username ?? os.userInfo().username;
  const exec = opts?.exec ?? execFileSync;
  const readFile = opts?.readFile ?? ((p: string) => fs.readFileSync(p, 'utf8'));
  const exists = opts?.exists ?? ((p: string) => fs.existsSync(p));
  const service = opts?.keychainService ?? OAUTH_KEYCHAIN_SERVICE;

  if (exists(filePath)) {
    const fromFile = parseToken(safeRead(readFile, filePath));
    if (fromFile) return { accessToken: fromFile, source: 'file' };
  }

  if (platform === 'darwin') {
    try {
      const stdout = exec(
        'security',
        ['find-generic-password', '-s', service, '-a', username, '-w'],
        { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      const fromKeychain = parseToken(stdout);
      if (fromKeychain) return { accessToken: fromKeychain, source: 'keychain' };
    } catch {
      return null;
    }
  }

  return null;
}

function safeRead(reader: (p: string) => string, p: string): string | null {
  try {
    return reader(p);
  } catch {
    return null;
  }
}

function parseToken(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.trim());
    const tok = parsed?.claudeAiOauth?.accessToken;
    return typeof tok === 'string' && tok.length > 0 ? tok : null;
  } catch {
    return null;
  }
}
