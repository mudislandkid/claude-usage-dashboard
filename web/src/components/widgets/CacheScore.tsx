import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useCacheScore } from '@/hooks/useCacheScore';
import { formatPercent, formatTokens } from '@/lib/format';
import { Link } from 'react-router-dom';

function tier(p: number): { className: string } {
  if (p >= 0.7)
    return { className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  if (p >= 0.4)
    return { className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
  return { className: 'bg-red-500/15 text-red-300 border-red-500/30' };
}

export function CacheScore() {
  const { data, isLoading } = useCacheScore();
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const t = tier(data.overall.effectiveness);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Cache effectiveness ({data.days}d)</CardTitle>
        <Badge variant="outline" className={t.className}>
          {formatPercent(data.overall.effectiveness, 1)}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground mb-4">
          {formatTokens(data.overall.cacheReadTokens)} read /{' '}
          {formatTokens(data.overall.cacheCreationTokens)} created /{' '}
          {formatTokens(data.overall.inputTokens)} fresh
        </div>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="pb-2">Project</th>
              <th className="pb-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.byProject.slice(0, 10).map((row) => {
              const tt = tier(row.effectiveness);
              return (
                <tr key={row.projectPath} className="border-t border-border">
                  <td className="py-2">
                    <Link
                      to={`/projects/${encodeURIComponent(row.projectPath)}`}
                      className="hover:underline"
                    >
                      {row.projectName}
                    </Link>
                  </td>
                  <td className="py-2 text-right">
                    <Badge variant="outline" className={tt.className}>
                      {formatPercent(row.effectiveness, 1)}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
