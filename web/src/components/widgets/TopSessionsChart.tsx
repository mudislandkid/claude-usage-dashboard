import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTokens } from '@/lib/format';
import type { TopSession } from '@/hooks/useProject';

export function TopSessionsChart({ data }: { data: TopSession[] }) {
  if (data.length === 0) return null;
  const maxTokens = data[0]?.totalTokens ?? 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top sessions by tokens</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {data.map((s) => {
          const pct = (s.totalTokens / maxTokens) * 100;
          return (
            <div key={s.sessionId} className="text-xs">
              <div className="flex justify-between mb-1">
                <Link
                  to={`/sessions/${s.sessionId}`}
                  className="hover:underline font-mono"
                >
                  {s.sessionId.slice(0, 12)}…
                  {s.isSubagent ? <span className="ml-1.5 text-amber-400">↳</span> : null}
                  <span className="ml-2 text-muted-foreground">
                    {s.primaryModel ?? '—'} • {s.turnCount} turns
                  </span>
                </Link>
                <span className="tabular-nums">{formatTokens(s.totalTokens)}</span>
              </div>
              <div className="h-1.5 rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-emerald-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
