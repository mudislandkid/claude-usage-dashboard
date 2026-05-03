import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useVersionAdoption } from '@/hooks/useHeavy';
import { formatRelative, formatTokens } from '@/lib/format';

export function VersionAdoption() {
  const { data, isLoading } = useVersionAdoption();
  if (isLoading || !data) return <Skeleton className="h-72" />;

  const total = data.versions.reduce((s, v) => s + v.totalTokens, 0);
  const sorted = [...data.versions].sort((a, b) => b.latest.localeCompare(a.latest));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Claude Code version adoption</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          {sorted.length} versions seen across all sessions. Most-recent first.
        </p>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="text-sm text-muted-foreground">No version metadata.</div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {sorted.map((v) => {
              const pct = total === 0 ? 0 : (v.totalTokens / total) * 100;
              return (
                <div key={v.version} className="text-xs">
                  <div className="flex justify-between mb-1 gap-2">
                    <span className="font-mono">{v.version}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {v.sessionCount} sess · {formatTokens(v.totalTokens)} · {formatRelative(v.latest)}
                    </span>
                  </div>
                  <div className="h-1 bg-muted rounded">
                    <div
                      className="h-full bg-primary/60 rounded"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
