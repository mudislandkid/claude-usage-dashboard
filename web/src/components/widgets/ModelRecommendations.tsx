import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useModelRecommendations } from '@/hooks/useToolUse';
import { formatPercent } from '@/lib/format';

export function ModelRecommendations() {
  const { data, isLoading } = useModelRecommendations(30);
  if (isLoading || !data) return <Skeleton className="h-96" />;

  const ranked = [...data.recommendations]
    .filter((r) => r.opusToolHeavyRatio >= 0.3 && r.toolCalls >= 200)
    .sort((a, b) => b.opusToolHeavyTokens - a.opusToolHeavyTokens)
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model recommendation candidates ({data.days}d)</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Projects where Opus does heavy mechanical work (Edit/Read/Write/Bash/Grep). Could potentially route this work to Haiku.
        </p>
      </CardHeader>
      <CardContent>
        {ranked.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No projects meet the threshold (200+ mechanical tool calls, 30%+ via Opus).
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground text-left tracking-wide">
              <tr>
                <th className="pb-2">Project</th>
                <th className="pb-2 text-right">Tool calls</th>
                <th className="pb-2 text-right">Opus %</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.projectPath} className="border-t border-border">
                  <td className="py-2">
                    <Link
                      to={`/projects/${encodeURIComponent(r.projectPath)}`}
                      className="hover:underline"
                    >
                      {r.projectName}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {r.toolCalls.toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    <Badge
                      variant="outline"
                      className="bg-purple-500/15 text-purple-300 border-purple-500/30"
                    >
                      {formatPercent(r.opusToolHeavyRatio, 0)}
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
