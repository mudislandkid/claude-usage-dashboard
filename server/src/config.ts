import os from 'node:os';
import path from 'node:path';

export const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
export const DB_PATH = path.join(os.homedir(), '.claude', 'usage-dashboard.db');
export const PORT = Number(process.env.PORT ?? 8787);
export const HOST = process.env.HOST ?? '127.0.0.1';
