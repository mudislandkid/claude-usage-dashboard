import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useModelMix } from '@/hooks/useModelMix';
import { formatTokens } from '@/lib/format';

export function ModelMix() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useModelMix(days);
  if (isLoading || !data) return <Skeleton className="h-96" />;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Model mix per project ({days}d)</CardTitle>
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
      <CardContent className="space-y-2">
        {data.rows.slice(0, 12).map((r) => {
          const total = r.opusTokens + r.sonnetTokens + r.haikuTokens + r.otherTokens;
          if (total === 0) return null;
          const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
          return (
            <div key={r.projectPath} className="text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">{r.projectName}</span>
                <span className="tabular-nums">{formatTokens(total)}</span>
              </div>
              <div className="flex h-2 rounded overflow-hidden bg-muted">
                {r.opusTokens > 0 && (
                  <div
                    title={`Opus ${pct(r.opusTokens)}`}
                    style={{ width: pct(r.opusTokens), background: 'hsl(280 70% 60%)' }}
                  />
                )}
                {r.sonnetTokens > 0 && (
                  <div
                    title={`Sonnet ${pct(r.sonnetTokens)}`}
                    style={{ width: pct(r.sonnetTokens), background: 'hsl(210 80% 60%)' }}
                  />
                )}
                {r.haikuTokens > 0 && (
                  <div
                    title={`Haiku ${pct(r.haikuTokens)}`}
                    style={{ width: pct(r.haikuTokens), background: 'hsl(160 70% 50%)' }}
                  />
                )}
                {r.otherTokens > 0 && (
                  <div
                    title={`Other ${pct(r.otherTokens)}`}
                    style={{ width: pct(r.otherTokens), background: 'hsl(var(--muted-foreground))' }}
                  />
                )}
              </div>
            </div>
          );
        })}
        <div className="flex gap-4 pt-3 text-[10px] text-muted-foreground">
          <Legend color="hsl(280 70% 60%)" label="Opus" />
          <Legend color="hsl(210 80% 60%)" label="Sonnet" />
          <Legend color="hsl(160 70% 50%)" label="Haiku" />
          <Legend color="hsl(var(--muted-foreground))" label="Other" />
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="size-2.5 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
