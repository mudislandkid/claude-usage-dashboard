import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWeekly, type WeeklyBar } from '@/hooks/useWeekly';

export function WeeklyLimitsCard() {
  const { data, isLoading } = useWeekly();
  if (isLoading || !data) return <Skeleton className="h-44" />;

  const hasAny = data.allModels !== null || data.sonnet !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Weekly limits</CardTitle>
          {data.oauth.enabled && data.oauth.credentialsPresent ? (
            <SourceBadge tone="ok" label={`OAuth · ${formatAge(data.oauth.ageSeconds)} ago`} />
          ) : data.allModels?.source === 'statusline' ? (
            <SourceBadge tone="info" label="Statusline" />
          ) : (
            <SourceBadge tone="muted" label="No data" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!hasAny && <EmptyState oauth={data.oauth} />}

        {data.allModels !== null && (
          <BarRow
            label="All models"
            sublabel={resetLabel(data.allModels.resetsAt)}
            bar={data.allModels}
          />
        )}

        {data.sonnet !== null && (
          <BarRow
            label="Sonnet only"
            sublabel={resetLabel(data.sonnet.resetsAt)}
            bar={data.sonnet}
          />
        )}

        {data.oauth.lastError && data.oauth.enabled && (
          <div className="text-xs text-amber-400">
            OAuth fetch error: {data.oauth.lastError}. Showing last cached values.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BarRow({
  label,
  sublabel,
  bar,
}: {
  label: string;
  sublabel: string;
  bar: WeeklyBar;
}) {
  const pct = Math.min(100, Math.max(0, bar.percent));
  const tone =
    pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{sublabel}</div>
        </div>
        <div className="text-sm font-medium tabular-nums">{pct.toFixed(0)}% used</div>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full ${tone} transition-[width]`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ProjectionLine bar={bar} />
    </div>
  );
}

function ProjectionLine({ bar }: { bar: WeeklyBar }) {
  const p = bar.projection;
  const status = p.status;

  let tone: 'good' | 'warning' | 'danger' | 'muted' = 'muted';
  let text = '';

  if (status === 'exhausted') {
    tone = 'danger';
    text = `Limit reached — resets ${formatAbsolute(bar.resetsAt)}`;
  } else if (status === 'will-exhaust' && p.etaToLimitAt !== null) {
    tone = 'danger';
    const leadHours =
      p.remainingHours !== null && p.etaToLimitHours !== null
        ? p.remainingHours - p.etaToLimitHours
        : null;
    const lead = leadHours !== null && leadHours > 0
      ? ` — approximately ${formatHours(leadHours)} before reset`
      : '';
    text = `Projected to hit 100% on ${formatAbsolute(p.etaToLimitAt)} at current avg pace${lead}`;
  } else if (status === 'pace-warning' && p.projectedFinalPercent !== null) {
    tone = 'warning';
    text = `On pace for ${p.projectedFinalPercent.toFixed(0)}% by reset (${formatAbsolute(bar.resetsAt)}) — close call`;
  } else if (status === 'ok' && p.projectedFinalPercent !== null) {
    tone = 'good';
    text = `On track — ~${p.projectedFinalPercent.toFixed(0)}% projected by reset (${(100 - p.projectedFinalPercent).toFixed(0)}% headroom)`;
  } else if (status === 'insufficient-data') {
    tone = 'muted';
    if (p.elapsedHours !== null && p.elapsedHours < 1) {
      text = 'Window just started — projection in <1h';
    } else if (bar.percent <= 0) {
      text = 'No usage yet this week';
    } else {
      text = 'Not enough data for projection yet';
    }
  }

  if (!text) return null;
  const cls =
    tone === 'danger'
      ? 'text-red-400'
      : tone === 'warning'
        ? 'text-amber-400'
        : tone === 'good'
          ? 'text-emerald-400'
          : 'text-muted-foreground';
  return <div className={`text-xs mt-2 ${cls}`}>{text}</div>;
}

function formatHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '—';
  if (hours < 1) {
    const m = Math.max(1, Math.round(hours * 60));
    return `${m}m`;
  }
  if (hours < 48) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const days = Math.floor(hours / 24);
  const remH = Math.round(hours - days * 24);
  return remH === 0 ? `${days}d` : `${days}d ${remH}h`;
}

/**
 * Format an ISO datetime relative to now: "today 9:30 PM", "tomorrow 9:30 PM",
 * "Sat 9:30 PM" (within 7 days), or "May 12, 9:30 PM" (further out).
 */
function formatAbsolute(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  if (dayDiff === 0) return `today ${time}`;
  if (dayDiff === 1) return `tomorrow ${time}`;
  if (dayDiff > 1 && dayDiff < 7) {
    return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  }
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function EmptyState({ oauth }: { oauth: { enabled: boolean; credentialsPresent: boolean } }) {
  if (!oauth.enabled) {
    return (
      <div className="text-sm text-muted-foreground">
        Submit a prompt in Claude Code to populate the all-models weekly bar via the
        statusline bridge, or enable the Anthropic OAuth fetch in Settings to also see the
        Sonnet-only breakdown.
      </div>
    );
  }
  if (!oauth.credentialsPresent) {
    return (
      <div className="text-sm text-amber-400">
        OAuth fetch is enabled but no Claude Code credentials were found. On macOS the
        dashboard reads them from the login keychain (service{' '}
        <code className="font-mono">Claude Code-credentials</code>) — first read may prompt
        for permission.
      </div>
    );
  }
  return (
    <div className="text-sm text-muted-foreground">Waiting for first OAuth response…</div>
  );
}

function SourceBadge({
  tone,
  label,
}: {
  tone: 'ok' | 'info' | 'muted';
  label: string;
}) {
  const cls =
    tone === 'ok'
      ? 'text-emerald-400 bg-emerald-400/10'
      : tone === 'info'
        ? 'text-sky-400 bg-sky-400/10'
        : 'text-muted-foreground bg-muted/40';
  return (
    <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}

function resetLabel(iso: string | null): string {
  if (!iso) return 'Reset time unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Reset time unknown';
  const now = new Date();
  const sameWeek = d.getTime() - now.getTime() < 7 * 86_400_000;
  const day = d.toLocaleDateString([], { weekday: 'short' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameWeek ? `Resets ${day} ${time}` : `Resets ${d.toLocaleDateString()} ${time}`;
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}
