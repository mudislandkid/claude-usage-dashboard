import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useTtlLeakage } from '@/hooks/useHeavy';
import { formatPercent, formatTokens } from '@/lib/format';

function tier(p: number): string {
  if (p >= 0.7) return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (p >= 0.4) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
}

export function TtlLeakage() {
  const { data, isLoading } = useTtlLeakage(30);
  if (isLoading || !data) return <Skeleton className="h-96" />;

  const o = data.overall;

  return (
    <Card>
      <CardHeader>
        <CardTitle>1-hour cache leakage ({data.days}d)</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          1h cache writes cost 2× a 5m write. If the next turn lands &lt;5 min later, a 5m
          write would have sufficed and the extra cost was wasted. Note: the harness picks
          the TTL — useful as a signal to Anthropic, not a knob you control directly.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-3">
          <Badge variant="outline" className={`text-base px-3 py-1 ${tier(o.leakageRatio)}`}>
            {formatPercent(o.leakageRatio, 1)} leaked
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatTokens(o.totalCreation1h)} 1h-cache tokens written
          </span>
        </div>
        <div className="space-y-1 text-xs">
          <Row
            color="hsl(160 70% 45%)"
            label="Useful (read in 5–60 min)"
            value={formatTokens(o.usefulIn1h)}
          />
          <Row
            color="hsl(38 90% 55%)"
            label="Wasted — 5m would have sufficed"
            value={formatTokens(o.wasted5mSufficient)}
          />
          <Row
            color="hsl(0 70% 55%)"
            label="Wasted — no follow-up in 1h"
            value={formatTokens(o.wastedNoFollowup)}
          />
        </div>
        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">
            Leakiest projects
          </div>
          <table className="w-full text-sm">
            <tbody>
              {data.byProject.slice(0, 6).map((p) => (
                <tr key={p.projectPath} className="border-t border-border">
                  <td className="py-1.5">{p.projectName}</td>
                  <td className="py-1.5 text-right text-xs text-muted-foreground tabular-nums">
                    {formatTokens(p.totalCreation1h)}
                  </td>
                  <td className="py-1.5 text-right">
                    <Badge variant="outline" className={tier(p.leakageRatio)}>
                      {formatPercent(p.leakageRatio, 0)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="size-2 rounded-sm" style={{ background: color }} />
      <span className="text-muted-foreground flex-1">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
