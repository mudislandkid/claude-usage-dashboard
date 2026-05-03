import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWindow } from '@/hooks/useWindow';
import { formatDuration, formatPercent, formatTokens } from '@/lib/format';
import {
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  PolarAngleAxis,
} from 'recharts';

export function WindowGauge() {
  const { data, isLoading } = useWindow();
  if (isLoading || !data) return <Skeleton className="h-72" />;

  const pct = Math.min(1, data.percentUsed);
  const color =
    pct > 0.85 ? 'hsl(0 70% 55%)' : pct > 0.6 ? 'hsl(38 90% 55%)' : 'hsl(160 70% 45%)';

  return (
    <Card>
      <CardHeader>
        <CardTitle>5-hour rolling window</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8">
          <div className="relative size-48 shrink-0">
            <ResponsiveContainer>
              <RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                data={[{ value: pct * 100, fill: color }]}
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  dataKey="value"
                  cornerRadius={10}
                  background={{ fill: 'hsl(var(--muted))' }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-3xl font-semibold tabular-nums">{formatPercent(pct)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                of {formatTokens(data.limitTokens)}
              </div>
            </div>
          </div>
          <div className="space-y-3 flex-1">
            <Stat label="Used" value={formatTokens(data.totalChargeable)} />
            <Stat
              label="Burn rate"
              value={`${formatTokens(Math.round(data.burnRatePerMin))} / min`}
            />
            <Stat label="Limit ETA" value={formatDuration(data.minutesToLimit)} />
            <Stat label="Cache reads (free)" value={formatTokens(data.cacheReadTokens)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border pb-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}
