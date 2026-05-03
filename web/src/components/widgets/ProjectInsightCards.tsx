import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPercent, formatTokens } from '@/lib/format';
import type {
  CacheStats,
  CacheTtl,
  Entrypoint,
  SubagentStats,
} from '@/hooks/useProject';

function tierClass(p: number): string {
  if (p >= 0.7) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (p >= 0.4) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-red-500/15 text-red-300 border-red-500/30';
}

export function CacheScoreCard({ cache, days }: { cache: CacheStats; days: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache effectiveness ({days}d)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-3">
          <Badge variant="outline" className={`text-base px-3 py-1 ${tierClass(cache.effectiveness)}`}>
            {formatPercent(cache.effectiveness, 1)}
          </Badge>
          <span className="text-xs text-muted-foreground">read / (read + create + fresh)</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>Read</span>
            <span className="tabular-nums">{formatTokens(cache.read)}</span>
          </div>
          <div className="flex justify-between">
            <span>Created</span>
            <span className="tabular-nums">{formatTokens(cache.creation)}</span>
          </div>
          <div className="flex justify-between">
            <span>Fresh input</span>
            <span className="tabular-nums">{formatTokens(cache.input)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ModelMixCard({
  mix,
  days,
}: {
  mix: { opus: number; sonnet: number; haiku: number; other: number };
  days: number;
}) {
  const total = mix.opus + mix.sonnet + mix.haiku + mix.other;
  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model mix ({days}d)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No activity in this window.</div>
        </CardContent>
      </Card>
    );
  }
  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model mix ({days}d)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex h-3 rounded overflow-hidden bg-muted">
          {mix.opus > 0 && (
            <div title={`Opus ${pct(mix.opus)}`} style={{ width: pct(mix.opus), background: 'hsl(280 70% 60%)' }} />
          )}
          {mix.sonnet > 0 && (
            <div title={`Sonnet ${pct(mix.sonnet)}`} style={{ width: pct(mix.sonnet), background: 'hsl(210 80% 60%)' }} />
          )}
          {mix.haiku > 0 && (
            <div title={`Haiku ${pct(mix.haiku)}`} style={{ width: pct(mix.haiku), background: 'hsl(160 70% 50%)' }} />
          )}
          {mix.other > 0 && (
            <div title={`Other ${pct(mix.other)}`} style={{ width: pct(mix.other), background: 'hsl(var(--muted-foreground))' }} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-y-1 text-xs">
          <Row color="hsl(280 70% 60%)" label="Opus" value={`${pct(mix.opus)} • ${formatTokens(mix.opus)}`} />
          <Row color="hsl(210 80% 60%)" label="Sonnet" value={`${pct(mix.sonnet)} • ${formatTokens(mix.sonnet)}`} />
          <Row color="hsl(160 70% 50%)" label="Haiku" value={`${pct(mix.haiku)} • ${formatTokens(mix.haiku)}`} />
          <Row color="hsl(var(--muted-foreground))" label="Other" value={`${pct(mix.other)} • ${formatTokens(mix.other)}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function SubagentCard({ stats, days }: { stats: SubagentStats; days: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subagent multiplier ({days}d)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-semibold tabular-nums">{stats.multiplier.toFixed(2)}×</div>
        <div className="text-xs text-muted-foreground">
          (parent + subagents) / parent. 1.00× = no fan-out, 2.00× = subagents doubled cost.
        </div>
        <div className="text-xs text-muted-foreground space-y-1 pt-1">
          <div className="flex justify-between">
            <span>Parent</span>
            <span className="tabular-nums">
              {formatTokens(stats.parentTokens)} • {stats.parentTurns} turns
            </span>
          </div>
          <div className="flex justify-between">
            <span>Subagents</span>
            <span className="tabular-nums">
              {formatTokens(stats.subagentTokens)} • {stats.subagentTurns} turns
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CacheTtlCard({ ttl, days }: { ttl: CacheTtl; days: number }) {
  const total = ttl.creation5m + ttl.creation1h;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache TTL split ({days}d)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <div className="text-sm text-muted-foreground">No cache writes in this window.</div>
        ) : (
          <>
            <div className="flex h-3 rounded overflow-hidden bg-muted">
              <div
                title={`5m ${formatPercent(1 - ttl.ratio1h)}`}
                style={{ width: `${(1 - ttl.ratio1h) * 100}%`, background: 'hsl(160 70% 45%)' }}
              />
              <div
                title={`1h ${formatPercent(ttl.ratio1h)}`}
                style={{ width: `${ttl.ratio1h * 100}%`, background: 'hsl(38 90% 55%)' }}
              />
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-xs">
              <Row color="hsl(160 70% 45%)" label="5-minute" value={`${formatPercent(1 - ttl.ratio1h)} • ${formatTokens(ttl.creation5m)}`} />
              <Row color="hsl(38 90% 55%)" label="1-hour" value={`${formatPercent(ttl.ratio1h)} • ${formatTokens(ttl.creation1h)}`} />
            </div>
            <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
              1h cache writes cost ~2× a 5m write but live longer. High 1h ratio = bet on long-living context; high 5m ratio = transient.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function EntrypointCard({ data }: { data: Entrypoint[] }) {
  const total = data.reduce((s, e) => s + e.sessionCount, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrypoints</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 ? (
          <div className="text-sm text-muted-foreground">No entrypoint metadata.</div>
        ) : (
          data.map((e) => {
            const pct = total === 0 ? 0 : (e.sessionCount / total) * 100;
            return (
              <div key={e.entrypoint} className="text-xs">
                <div className="flex justify-between mb-0.5">
                  <span className="font-mono">{e.entrypoint}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {e.sessionCount} • {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded">
                  <div className="h-full bg-primary/60 rounded" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <div className="size-2 rounded-sm" style={{ background: color }} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <div className="text-right tabular-nums">{value}</div>
    </>
  );
}
