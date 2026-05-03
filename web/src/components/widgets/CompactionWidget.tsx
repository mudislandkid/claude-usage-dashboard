import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useCompaction } from '@/hooks/useToolUse';
import { formatPercent } from '@/lib/format';

export function CompactionWidget() {
  const { data, isLoading } = useCompaction(30);
  if (isLoading || !data) return <Skeleton className="h-96" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Multi-iteration turns by project ({data.days}d)</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Turns where the model required multiple internal round-trips (extended thinking continuations).
          Note: Claude Code's /compact is a harness-level op and doesn't surface here.
        </p>
      </CardHeader>
      <CardContent>
        {data.projects.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No projects with ≥50 turns in this window.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground text-left tracking-wide">
              <tr>
                <th className="pb-2">Project</th>
                <th className="pb-2 text-right">Turns</th>
                <th className="pb-2 text-right">Compacted</th>
                <th className="pb-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.slice(0, 10).map((p) => {
                const flagged = p.compactionRate >= 0.05;
                return (
                  <tr key={p.projectPath} className="border-t border-border">
                    <td className="py-2">
                      <Link
                        to={`/projects/${encodeURIComponent(p.projectPath)}`}
                        className="hover:underline"
                      >
                        {p.projectName}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {p.totalTurns.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {p.compactedTurns.toLocaleString()}
                    </td>
                    <td className="py-2 text-right">
                      <Badge
                        variant="outline"
                        className={
                          flagged
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'text-muted-foreground'
                        }
                      >
                        {formatPercent(p.compactionRate, 1)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
