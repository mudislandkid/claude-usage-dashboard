import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { useWeekly, type WeeklyBar } from '@/hooks/useWeekly';

export function WeeklyLimitsPanel() {
  const { data } = useWeekly();
  if (!data) return <TPanel title="WEEKLY_LIMITS">Loading…</TPanel>;

  const fetched = data.oauth.fetchedAt
    ? new Date(data.oauth.fetchedAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
      })
    : null;
  const sourceTag = data.oauth.enabled && data.oauth.credentialsPresent
    ? fetched
      ? `OAUTH · ${fetched.toUpperCase()}`
      : 'OAUTH'
    : 'STATUSLINE';

  return (
    <TPanel
      title="WEEKLY_LIMITS"
      sub="// reset sun 02:00 utc"
      action={sourceTag}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        <WeeklyRow
          label="ALL_MODELS"
          bar={data.allModels}
          color={TT.green}
        />
        <WeeklyRow
          label="SONNET_ONLY"
          bar={data.sonnet}
          color={TT.purple}
        />
        <WeeklyRow
          label="CLAUDE_DESIGN"
          bar={data.claudeDesign}
          color={TT.blue}
        />
      </div>
      {data.oauth.lastError && data.oauth.enabled && (
        <div
          style={{
            marginTop: 14,
            fontFamily: TT_MONO,
            fontSize: 10,
            color: TT.amber,
          }}
        >
          ⚠ OAuth fetch error: {data.oauth.lastError}
        </div>
      )}
    </TPanel>
  );
}

interface RowProps {
  label: string;
  bar: WeeklyBar | null;
  color: string;
}

function WeeklyRow({ label, bar, color }: RowProps) {
  if (!bar) {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 8,
            fontFamily: TT_MONO,
          }}
        >
          <span style={{ color, fontSize: 12 }}>{label}</span>
          <span style={{ color: TT.textDim, fontSize: 11 }}>no data</span>
        </div>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            height: 12,
            background: 'rgba(120,200,140,0.05)',
          }}
        />
        <div
          style={{
            fontFamily: TT_MONO,
            fontSize: 9,
            color: TT.textDim,
            marginTop: 6,
          }}
        >
          enable OAuth fetch in settings or submit a prompt in Claude Code
        </div>
      </div>
    );
  }
  const used = bar.percent;
  const proj = bar.projection.projectedFinalPercent ?? used;
  const projColor = proj >= 100 ? TT.red : proj >= 80 ? TT.amber : TT.green;
  const note = projectionNote(bar);
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
          fontFamily: TT_MONO,
        }}
      >
        <span style={{ color, fontSize: 12 }}>{label}</span>
        <span style={{ color: TT.textMute, fontSize: 11 }}>
          used <span style={{ color: TT.green }}>{used.toFixed(0)}%</span> · proj{' '}
          <span style={{ color: projColor }}>{proj.toFixed(0)}%</span>
          <span
            style={{ color: TT.textDim, fontSize: 9, marginLeft: 6 }}
            title={
              bar.projection.method === 'time-of-day'
                ? 'Projection weights remaining time by your typical hour-of-week usage shape.'
                : 'Flat linear pace — not enough history yet for a time-of-day model.'
            }
          >
            ({bar.projection.method === 'time-of-day' ? 'time-of-day' : 'linear'})
          </span>
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          height: 12,
          background: 'rgba(120,200,140,0.05)',
        }}
      >
        <div style={{ width: `${Math.min(100, used)}%`, background: color, transition: 'width 400ms ease' }} />
        <div
          style={{
            width: `${Math.max(0, Math.min(100, proj) - used)}%`,
            background: `repeating-linear-gradient(45deg, ${color}40, ${color}40 3px, transparent 3px, transparent 6px)`,
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: TT_MONO,
          fontSize: 9,
          color: TT.textDim,
          marginTop: 6,
        }}
      >
        <span>0%</span>
        <span style={{ color: TT.textMute }}>{note}</span>
        <span>100%</span>
      </div>
      <EtaLine bar={bar} />
    </div>
  );
}

function EtaLine({ bar }: { bar: WeeklyBar }) {
  const p = bar.projection;

  if (p.status === 'exhausted') {
    return (
      <div
        style={{
          marginTop: 8,
          fontFamily: TT_MONO,
          fontSize: 10,
          color: TT.red,
          lineHeight: 1.4,
        }}
      >
        ▸ limit reached · resets {formatAbsolute(bar.resetsAt)}
      </div>
    );
  }

  if (p.status !== 'will-exhaust' || p.etaToLimitAt === null) return null;

  const leadHours =
    p.remainingHours !== null && p.etaToLimitHours !== null
      ? p.remainingHours - p.etaToLimitHours
      : null;

  return (
    <div
      style={{
        marginTop: 8,
        fontFamily: TT_MONO,
        fontSize: 10,
        color: TT.textMute,
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: TT.red }}>▸ </span>
      projected to hit{' '}
      <span style={{ color: TT.red }}>100%</span> on{' '}
      <span style={{ color: TT.red }}>{formatAbsolute(p.etaToLimitAt)}</span>
      {p.etaToLimitHours !== null && (
        <> · <span style={{ color: TT.amber }}>in {formatLead(p.etaToLimitHours)}</span></>
      )}
      {leadHours !== null && leadHours > 0 && (
        <>
          {' · '}
          <span style={{ color: TT.amber }}>~{formatLead(leadHours)}</span> before reset{' '}
          <span style={{ color: TT.textDim }}>({formatAbsolute(bar.resetsAt)})</span>
        </>
      )}
    </div>
  );
}

function formatLead(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
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

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const time = d
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  if (dayDiff === 0) return `today ${time}`;
  if (dayDiff === 1) return `tomorrow ${time}`;
  if (dayDiff > 1 && dayDiff < 7) {
    return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  }
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function projectionNote(bar: WeeklyBar): string {
  const p = bar.projection;
  switch (p.status) {
    case 'exhausted':
      return 'limit reached';
    case 'will-exhaust':
      return 'projected to hit cap';
    case 'pace-warning':
      return 'close call by reset';
    case 'ok':
      return p.projectedFinalPercent !== null
        ? `${(100 - p.projectedFinalPercent).toFixed(0)}% headroom remaining`
        : 'on track';
    case 'insufficient-data':
      return 'awaiting data';
  }
}
