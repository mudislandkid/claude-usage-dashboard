import os from 'node:os';
import path from 'node:path';

export const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
export const DB_PATH = path.join(os.homedir(), '.claude', 'usage-dashboard.db');
export const STATUSLINE_SIDECAR = path.join(os.homedir(), '.claude', 'usage-dashboard.statusline.json');
export const OAUTH_USAGE_CACHE = path.join(os.homedir(), '.claude', 'usage-dashboard.usage-api.json');
export const OAUTH_CREDENTIALS_FILE = path.join(os.homedir(), '.claude', '.credentials.json');
export const OAUTH_KEYCHAIN_SERVICE = 'Claude Code-credentials';
export const PORT = Number(process.env.PORT ?? 8790);
export const HOST = process.env.HOST ?? '127.0.0.1';
