import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToolUse } from '@/hooks/useToolUse';

export function ToolUseChart() {
  const { data, isLoading } = useToolUse(30);
  if (isLoading || !data) return <Skeleton className="h-96" />;

  const max = data.tools[0]?.count ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tool use ({data.days}d)</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          What you actually do with Claude. Edit/Bash/Read dominance = mechanical workflow; Agent dominance = orchestration.
        </p>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {data.tools.length === 0 ? (
          <div className="text-sm text-muted-foreground">No tool calls in this window.</div>
        ) : (
          data.tools.slice(0, 25).map((t) => {
            const pct = (t.count / max) * 100;
            return (
              <div key={t.toolName} className="text-xs">
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-muted-foreground truncate max-w-[60%]">
                    {t.toolName}
                  </span>
                  <span className="tabular-nums">{t.count.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
