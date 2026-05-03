import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEntrypoints } from '@/hooks/useInsights';
import { formatTokens } from '@/lib/format';

export function EntrypointSplit() {
  const { data, isLoading } = useEntrypoints();
  if (isLoading || !data) return <Skeleton className="h-56" />;

  const total = data.entrypoints.reduce((s, e) => s + e.totalTokens, 0);
  const totalSessions = data.entrypoints.reduce((s, e) => s + e.sessionCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrypoint split (lifetime)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          {totalSessions} sessions · {formatTokens(total)} tokens
        </div>
        {data.entrypoints.map((e) => {
          const pct = total === 0 ? 0 : (e.totalTokens / total) * 100;
          return (
            <div key={e.entrypoint} className="text-xs">
              <div className="flex justify-between mb-1">
                <span className="font-mono">{e.entrypoint}</span>
                <span className="tabular-nums text-muted-foreground">
                  {e.sessionCount} sess · {formatTokens(e.totalTokens)} ({pct.toFixed(0)}%)
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded">
                <div
                  className="h-full rounded bg-gradient-to-r from-purple-500 to-emerald-500"
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
