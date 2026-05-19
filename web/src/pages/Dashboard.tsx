import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { useRange } from '@/components/terminal/RangeContext';
import { useProjects } from '@/hooks/useProjects';
import { useWindow } from '@/hooks/useWindow';
import { DashboardTicker } from '@/components/term-widgets/Ticker';
import { FiveHourGaugePanel } from '@/components/term-widgets/FiveHourGauge';
import { ForecastPanel } from '@/components/term-widgets/ForecastPanel';
import { WeeklyLimitsPanel } from '@/components/term-widgets/WeeklyLimits';
import { SubscriptionValuePanel } from '@/components/term-widgets/SubscriptionValue';
import { CacheEffectivenessPanel } from '@/components/term-widgets/CacheEffectiveness';
import { HeatmapPanel } from '@/components/term-widgets/Heatmap';
import { ModelMixPanel } from '@/components/term-widgets/ModelMix';
import { ToolUsePanel } from '@/components/term-widgets/ToolUse';
import { OpusDowngradePanel } from '@/components/term-widgets/OpusDowngrade';
import { WorstSessionsPanel } from '@/components/term-widgets/WorstSessions';
import { CacheTtlPanel } from '@/components/term-widgets/CacheTtlPanel';
import { LeakagePanel } from '@/components/term-widgets/LeakagePanel';
import { formatTokens } from '@/lib/format';

export function Dashboard() {
  const { range } = useRange();
  const { data: projects } = useProjects();
  const { data: win } = useWindow();
  const totalSessions = projects?.projects.reduce((a, b) => a + b.sessionCount, 0) ?? 0;
  const totalTokens = projects?.projects.reduce((a, b) => a + b.totalTokens, 0) ?? 0;

  return (
    <div
      style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
      className="tt-fade"
    >
      <TPanel padded={false}>
        <DashboardTicker />
      </TPanel>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)', gap: 16 }}>
        <FiveHourGaugePanel />
        <ForecastPanel />
      </div>

      <WeeklyLimitsPanel />
      <SubscriptionValuePanel />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 16 }}>
        <CacheEffectivenessPanel />
        <HeatmapPanel />
      </div>

      <ModelMixPanel />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
        <ToolUsePanel />
        <OpusDowngradePanel />
      </div>

      <WorstSessionsPanel />
      <CacheTtlPanel />
      <LeakagePanel />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 4px',
          fontSize: 10,
          color: TT.textMute,
          fontFamily: TT_MONO,
        }}
      >
        <span>
          {projects?.projects.length ?? 0} PROJECTS · {totalSessions} SESSIONS ·{' '}
          {formatTokens(totalTokens)} TOKENS LIFETIME · RANGE {range}
        </span>
        <span>
          {win ? `LIMIT ${formatTokens(win.effectiveLimitTokens)}` : '—'} · BRIDGE{' '}
          {win?.bridge.active ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>
    </div>
  );
}
