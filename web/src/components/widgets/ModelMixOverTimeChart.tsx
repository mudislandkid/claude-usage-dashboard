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
import type { ModelMixOverTimePoint } from '@/hooks/useProject';

export function ModelMixOverTimeChart({ data }: { data: ModelMixOverTimePoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model mix over time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} stackOffset="expand">
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
              />
              <YAxis
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={40}
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
              <Area type="monotone" dataKey="opus" stackId="1" stroke="hsl(280 70% 60%)" fill="hsl(280 70% 60%)" />
              <Area type="monotone" dataKey="sonnet" stackId="1" stroke="hsl(210 80% 60%)" fill="hsl(210 80% 60%)" />
              <Area type="monotone" dataKey="haiku" stackId="1" stroke="hsl(160 70% 50%)" fill="hsl(160 70% 50%)" />
              <Area type="monotone" dataKey="other" stackId="1" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
