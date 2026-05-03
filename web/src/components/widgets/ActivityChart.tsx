import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatTokens } from '@/lib/format';
import type { ActivityPoint } from '@/hooks/useProject';

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily activity (chargeable tokens)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(160 70% 50%)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="hsl(160 70% 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
              />
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
                formatter={(v: number) => formatTokens(v)}
                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
              />
              <Area
                type="monotone"
                dataKey="chargeable"
                stroke="hsl(160 70% 50%)"
                strokeWidth={2}
                fill="url(#actGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
