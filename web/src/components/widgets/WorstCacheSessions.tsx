import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useWorstCacheSessions } from '@/hooks/useInsights';
import { formatPercent, formatTokens } from '@/lib/format';

function tier(p: number): string {
  if (p >= 0.7) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (p >= 0.4) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-red-500/15 text-red-300 border-red-500/30';
}

export function WorstCacheSessions() {
  const { data, isLoading } = useWorstCacheSessions(30);
  if (isLoading || !data) return <Skeleton className="h-96" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Worst-offender sessions ({data.days}d)</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Sessions ≥ 200k tokens with the lowest cache effectiveness — best targets for optimization.
        </p>
      </CardHeader>
      <CardContent>
        {data.sessions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No sessions to flag yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground text-left tracking-wide">
              <tr>
                <th className="pb-2">Project</th>
                <th className="pb-2">Session</th>
                <th className="pb-2 text-right">Tokens</th>
                <th className="pb-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.sessionId} className="border-t border-border">
                  <td className="py-2">
                    <Link
                      to={`/projects/${encodeURIComponent(s.projectPath)}`}
                      className="hover:underline"
                    >
                      {s.projectName}
                    </Link>
                  </td>
                  <td className="py-2 font-mono text-xs">
                    <Link to={`/sessions/${s.sessionId}`} className="hover:underline">
                      {s.sessionId.slice(0, 10)}…
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatTokens(s.totalTokens)}</td>
                  <td className="py-2 text-right">
                    <Badge variant="outline" className={tier(s.effectiveness)}>
                      {formatPercent(s.effectiveness, 1)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
