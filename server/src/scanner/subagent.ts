import path from 'node:path';

export function isSubagentFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return /\/subagents\/agent-[^/]+\.jsonl$/.test(norm);
}

export function parentSessionFromPath(filePath: string): string | null {
  const norm = filePath.replace(/\\/g, '/');
  const m = norm.match(/\/([0-9a-f-]+)\/subagents\/agent-[^/]+\.jsonl$/i);
  return m ? m[1]! : null;
}

export function topLevelSessionId(filePath: string): string | null {
  const base = path.basename(filePath, '.jsonl');
  return /^[0-9a-f-]{8,}$/i.test(base) ? base : null;
}
