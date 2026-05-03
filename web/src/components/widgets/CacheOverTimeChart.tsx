import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPercent } from '@/lib/format';
import type { CacheOverTimePoint } from '@/hooks/useProject';

export function CacheOverTimeChart({ data }: { data: CacheOverTimePoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache effectiveness over time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(v) => formatPercent(v)}
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
                formatter={(v: number) => formatPercent(v, 1)}
                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
              />
              <Line
                type="monotone"
                dataKey="effectiveness"
                stroke="hsl(280 70% 60%)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
