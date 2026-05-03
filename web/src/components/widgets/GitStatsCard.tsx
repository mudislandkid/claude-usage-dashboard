import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatTokens } from '@/lib/format';
import type { GitStats } from '@/hooks/useProject';

interface Props {
  git: GitStats | null;
  totalTokens: number;
  days: number;
}

export function GitStatsCard({ git, totalTokens, days }: Props) {
  if (!git) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Git activity ({days}d)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No git data available.</div>
        </CardContent>
      </Card>
    );
  }

  if (!git.pathExists) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Git activity ({days}d)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Project path no longer exists on disk.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!git.isRepo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Git activity ({days}d)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Not a git repository.</div>
        </CardContent>
      </Card>
    );
  }

  const tokensPerCommit =
    git.commitCount > 0 ? Math.round(totalTokens / git.commitCount) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Git activity ({days}d)</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Branch:{' '}
          <span className="font-mono">{git.branch ?? '—'}</span>
          {' · '}
          {git.commitCount} commits in window
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Commits landed" value={String(git.commitCount)} />
          <Stat
            label="Tokens / commit"
            value={tokensPerCommit > 0 ? formatTokens(tokensPerCommit) : '—'}
          />
        </div>
        {git.commits.length > 0 && (
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">
              Recent commits
            </div>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {git.commits.slice(0, 15).map((c) => (
                <li
                  key={c.hash}
                  className="text-xs flex justify-between gap-3 border-b border-border pb-1.5"
                >
                  <span className="truncate flex-1">{c.subject}</span>
                  <Badge variant="outline" className="font-mono shrink-0 text-[10px]">
                    {c.hash.slice(0, 7)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
