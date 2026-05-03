import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCacheByHour } from '@/hooks/useInsights';
import { formatPercent, formatTokens } from '@/lib/format';

export function CacheByHour() {
  const { data, isLoading } = useCacheByHour(30);
  if (isLoading || !data) return <Skeleton className="h-72" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache effectiveness by hour-of-day ({data.days}d)</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Bars: tokens by hour. Line: cache effectiveness. See if your morning-vs-night habits matter.
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer>
            <ComposedChart data={data.hours} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis
                yAxisId="left"
                tickFormatter={formatTokens}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={50}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 1]}
                tickFormatter={(v) => formatPercent(v)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={42}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelFormatter={(h) => `${h}:00`}
                formatter={(v: number, name: string) =>
                  name === 'effectiveness' ? formatPercent(v, 1) : formatTokens(v)
                }
              />
              <Bar yAxisId="left" dataKey="totalTokens" fill="hsl(217 33% 30%)" />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="effectiveness"
                stroke="hsl(160 70% 50%)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
