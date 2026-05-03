import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useHeatmap } from '@/hooks/useHeatmap';
import { formatTokens } from '@/lib/format';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ActivityHeatmap() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useHeatmap(days);

  const grid = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const c of data?.cells ?? []) {
      const row = g[c.weekday];
      if (row) {
        row[c.hour] = c.tokens;
        if (c.tokens > max) max = c.tokens;
      }
    }
    return { g, max };
  }, [data]);

  if (isLoading || !data) return <Skeleton className="h-80" />;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Activity heatmap</CardTitle>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-2.5 py-1 rounded-md border ${
                days === d
                  ? 'bg-accent text-foreground border-border'
                  : 'text-muted-foreground border-transparent hover:border-border'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="text-[10px] tabular-nums">
            <thead>
              <tr>
                <th></th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="text-muted-foreground font-normal w-5 px-0.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.g.map((row, day) => (
                <tr key={day}>
                  <td className="text-muted-foreground pr-2 text-right">{DAYS[day]}</td>
                  {row.map((v, h) => {
                    const t = grid.max === 0 ? 0 : v / grid.max;
                    const bg =
                      t === 0
                        ? 'hsl(var(--muted))'
                        : `hsla(160, 70%, ${20 + t * 40}%, ${0.3 + t * 0.7})`;
                    return (
                      <td key={h} className="p-0">
                        <div
                          title={`${DAYS[day]} ${h}:00 — ${formatTokens(v)}`}
                          className="w-5 h-5 m-px rounded-sm"
                          style={{ background: bg }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
