import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useForecast } from '@/hooks/useInsights';
import { formatTokens } from '@/lib/format';

export function Forecast() {
  const { data, isLoading } = useForecast(30);
  if (isLoading || !data) return <Skeleton className="h-72" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next 24h forecast</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Average chargeable burn for each upcoming hour, based on the same weekday-and-hour over the last 30 days.
        </p>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums mb-1">
          {formatTokens(data.totalNext24h)}
        </div>
        <div className="text-xs text-muted-foreground mb-3">expected chargeable in next 24h</div>
        <div className="h-40">
          <ResponsiveContainer>
            <AreaChart data={data.byHour} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(38 90% 55%)" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="hsl(38 90% 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis
                tickFormatter={formatTokens}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelFormatter={(h) => `${h}:00`}
                formatter={(v: number) => formatTokens(v)}
              />
              <Area
                type="monotone"
                dataKey="expectedChargeable"
                stroke="hsl(38 90% 55%)"
                strokeWidth={2}
                fill="url(#fcGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
