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

  const resetsAtIso = data.bridge.active
    ? data.bridge.fiveHourResetsAt
    : data.windowEnd;
  const resetsAtLabel = resetsAtIso
    ? new Date(resetsAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const bridgeBadge = data.bridge.active ? (
    <span className="text-[10px] uppercase tracking-wide text-emerald-400 bg-emerald-400/10 rounded px-1.5 py-0.5">
      Live · Anthropic
    </span>
  ) : data.bridge.sidecarPresent ? (
    <span className="text-[10px] uppercase tracking-wide text-amber-400 bg-amber-400/10 rounded px-1.5 py-0.5">
      Bridge stale
    </span>
  ) : (
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5">
      Estimated
    </span>
  );

  // Projection line: either you'll hit the limit (red), or you'll finish the window
  // with headroom (green). Burn rate is "last 15 min".
  const projection = (() => {
    if (!data.windowActive) {
      return { tone: 'muted' as const, label: 'Idle — send a message to start a new 5h window' };
    }
    if (data.burnRatePerMin <= 0) {
      return { tone: 'muted' as const, label: 'No recent activity — burn rate at 0' };
    }
    if (data.minutesToLimit !== null) {
      return {
        tone: 'danger' as const,
        label: `Hits limit in ${formatDuration(data.minutesToLimit)} at current pace`,
      };
    }
    if (data.headroomTokensAtReset !== null) {
      return {
        tone: 'good' as const,
        label: `On track — ~${formatTokens(data.headroomTokensAtReset)} headroom by reset`,
      };
    }
    return { tone: 'muted' as const, label: '—' };
  })();

  const projectionColor =
    projection.tone === 'danger'
      ? 'text-red-400'
      : projection.tone === 'good'
        ? 'text-emerald-400'
        : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>5-hour rolling window</CardTitle>
          {bridgeBadge}
        </div>
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
                of {formatTokens(data.effectiveLimitTokens)}
                {data.bridge.active ? ' (Anthropic)' : ''}
              </div>
            </div>
          </div>
          <div className="space-y-3 flex-1">
            <Stat label="Used" value={formatTokens(data.totalChargeable)} />
            <Stat
              label="Resets in"
              value={
                data.minutesToReset !== null
                  ? `${formatDuration(data.minutesToReset)}${resetsAtLabel ? ` (${resetsAtLabel})` : ''}`
                  : '—'
              }
            />
            <Stat
              label="Burn rate"
              value={`${formatTokens(Math.round(data.burnRatePerMin))} / min`}
              hint="last 15 min"
            />
            <Stat label="Cache reads (free)" value={formatTokens(data.cacheReadTokens)} />
            <div className={`text-sm font-medium pt-1 ${projectionColor}`}>{projection.label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between border-b border-border pb-1.5">
      <span className="text-sm text-muted-foreground">
        {label}
        {hint ? <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">{hint}</span> : null}
      </span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}
