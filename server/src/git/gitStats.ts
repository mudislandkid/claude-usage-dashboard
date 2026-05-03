import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export interface GitCommit {
  hash: string;
  date: string;
  subject: string;
}

export interface GitStats {
  isRepo: boolean;
  branch: string | null;
  commits: GitCommit[];
  commitCount: number;
  pathExists: boolean;
}

function safeGit(args: string[], cwd: string, timeoutMs = 3000): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
  } catch {
    return null;
  }
}

export function gitStats(projectPath: string, days: number): GitStats {
  const empty: GitStats = {
    isRepo: false,
    branch: null,
    commits: [],
    commitCount: 0,
    pathExists: false,
  };
  if (!projectPath || projectPath === 'unknown') return empty;
  if (!fs.existsSync(projectPath)) return empty;

  const inside = safeGit(['rev-parse', '--is-inside-work-tree'], projectPath);
  if (!inside || inside.trim() !== 'true') {
    return { ...empty, pathExists: true };
  }

  const branch = safeGit(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)?.trim() ?? null;
  const log = safeGit(
    [
      'log',
      `--since=${days} days ago`,
      '--pretty=format:%H|%aI|%s',
      '--no-merges',
    ],
    projectPath,
    5000,
  );

  const commits: GitCommit[] = [];
  if (log) {
    for (const line of log.split('\n')) {
      if (!line.trim()) continue;
      const [hash, date, ...rest] = line.split('|');
      if (!hash || !date) continue;
      commits.push({ hash, date, subject: rest.join('|') });
    }
  }

  return {
    isRepo: true,
    branch,
    commits,
    commitCount: commits.length,
    pathExists: true,
  };
}
