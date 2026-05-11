import { useMemo, useState } from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { useRangeDays, useRangeLabel } from '@/components/terminal/RangeContext';
import { useHeatmap } from '@/hooks/useHeatmap';
import { formatTokens } from '@/lib/format';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function HeatmapPanel() {
  const days = useRangeDays();
  const label = useRangeLabel();
  const { data } = useHeatmap(days);
  const [hover, setHover] = useState<string | null>(null);

  const grid = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    let peak = { day: 0, hour: 0, tokens: 0 };
    for (const c of data?.cells ?? []) {
      const row = g[c.weekday];
      if (row) {
        row[c.hour] = c.tokens;
        if (c.tokens > max) max = c.tokens;
        if (c.tokens > peak.tokens) peak = { day: c.weekday, hour: c.hour, tokens: c.tokens };
      }
    }
    return { g, max, peak };
  }, [data]);

  const insights = useMemo(() => deriveInsights(grid.g), [grid]);

  if (!data) return <TPanel title="ACTIVITY_HEATMAP">Loading…</TPanel>;

  const cell = 22;
  const gap = 3;
  const peakLabel = grid.max > 0
    ? `PEAK ${String(grid.peak.hour).padStart(2, '0')}:00 ${DAYS[grid.peak.day]}`
    : '—';

  return (
    <TPanel
      title="ACTIVITY_HEATMAP"
      sub={`// ${label} · local`}
      action={peakLabel}
      accent={TT.purple}
    >
      <div style={{ overflowX: 'auto' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${36 + 24 * (cell + gap)} ${26 + 7 * (cell + gap)}`}
        >
          {Array.from({ length: 24 }, (_, i) =>
            i % 2 === 0 ? (
              <text
                key={i}
                x={38 + i * (cell + gap) + cell / 2}
                y={10}
                fontSize={9}
                fill={TT.textDim}
                fontFamily={TT_MONO}
                textAnchor="middle"
              >
                {String(i).padStart(2, '0')}
              </text>
            ) : null,
          )}
          {grid.g.map((row, r) => (
            <g key={r}>
              <text
                x={0}
                y={26 + r * (cell + gap) + cell * 0.66}
                fontSize={10}
                fill={TT.textMute}
                fontFamily={TT_MONO}
              >
                {DAYS[r]}
              </text>
              {row.map((v, c) => {
                const a = grid.max === 0 ? 0.04 : v === 0 ? 0.04 : 0.14 + (v / grid.max) * 0.85;
                const id = `${r}-${c}`;
                return (
                  <rect
                    key={c}
                    x={38 + c * (cell + gap)}
                    y={26 + r * (cell + gap) - cell * 0.85}
                    width={cell}
                    height={cell}
                    fill={TT.green}
                    fillOpacity={a}
                    stroke={hover === id ? TT.greenBright : 'rgba(0,0,0,0.4)'}
                    strokeWidth={hover === id ? 1.5 : 0.5}
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'crosshair', transition: 'stroke 120ms' }}
                  >
                    <title>{`${DAYS[r]} ${String(c).padStart(2, '0')}:00 — ${formatTokens(v)}`}</title>
                  </rect>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 14,
          fontFamily: TT_MONO,
          fontSize: 9,
          color: TT.textMute,
        }}
      >
        <span>00:00 →&nbsp;&nbsp;→&nbsp;&nbsp;→&nbsp;&nbsp;23:00 local</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>IDLE</span>
          {[0.08, 0.22, 0.4, 0.6, 0.85].map((a) => (
            <div key={a} style={{ width: 16, height: 8, background: TT.green, opacity: a }} />
          ))}
          <span>PEAK</span>
        </div>
      </div>

      {insights && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: `1px dashed ${TT.border}`,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            fontFamily: TT_MONO,
            fontSize: 10,
            color: TT.textMute,
            lineHeight: 1.5,
          }}
        >
          <Insight
            label="MOST_ACTIVE_HOUR"
            value={`${pad(insights.topHour.hour)}:00–${pad((insights.topHour.hour + 1) % 24)}:00`}
            sub={`${formatTokens(insights.topHour.tokens)} · ${insights.topHour.pct.toFixed(0)}% of total`}
            color={TT.purple}
          />
          <Insight
            label="MOST_ACTIVE_DAY"
            value={DAYS[insights.topDay.day] ?? '—'}
            sub={`${formatTokens(insights.topDay.tokens)} · ${insights.topDay.pct.toFixed(0)}% of total`}
            color={TT.green}
          />
          <Insight
            label="PEAK_CELL"
            value={`${DAYS[grid.peak.day]} ${pad(grid.peak.hour)}:00`}
            sub={`${formatTokens(grid.peak.tokens)} in one hour`}
            color={TT.amber}
          />
          <Insight
            label="WEEKDAYS_VS_WEEKENDS"
            value={`${insights.weekdayPct.toFixed(0)}% / ${(100 - insights.weekdayPct).toFixed(0)}%`}
            sub={`mon–fri vs sat–sun share`}
            color={TT.blue}
          />
          <Insight
            label="WORKING_HOURS"
            value={`${insights.workingHoursPct.toFixed(0)}%`}
            sub={`09:00–18:00 share`}
            color={TT.blue}
          />
          <Insight
            label="LATE_NIGHT"
            value={`${insights.lateNightPct.toFixed(0)}%`}
            sub={`22:00–04:00 share`}
            color={
              insights.lateNightPct > 25
                ? TT.amber
                : insights.lateNightPct > 10
                  ? TT.blue
                  : TT.textMute
            }
          />
        </div>
      )}
    </TPanel>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function Insight({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: TT.textDim, fontSize: 9, letterSpacing: '0.10em' }}>{label}</span>
      <span style={{ color, fontSize: 13, fontWeight: 500 }}>{value}</span>
      <span style={{ color: TT.textMute, fontSize: 9 }}>{sub}</span>
    </div>
  );
}

interface Insights {
  topHour: { hour: number; tokens: number; pct: number };
  topDay: { day: number; tokens: number; pct: number };
  weekdayPct: number; // 0..100
  workingHoursPct: number; // 09–18 share, 0..100
  lateNightPct: number; // 22–04 share, 0..100
}

function deriveInsights(grid: number[][]): Insights | null {
  let total = 0;
  for (const row of grid) for (const v of row) total += v;
  if (total <= 0) return null;

  // Sum across all weekdays for each hour-of-day, and vice versa.
  const hourTotals = Array.from({ length: 24 }, (_, h) =>
    grid.reduce((a, row) => a + (row[h] ?? 0), 0),
  );
  const dayTotals = grid.map((row) => row.reduce((a, v) => a + v, 0));

  const topHourIdx = hourTotals.reduce(
    (best, v, i) => (v > hourTotals[best]! ? i : best),
    0,
  );
  const topDayIdx = dayTotals.reduce(
    (best, v, i) => (v > dayTotals[best]! ? i : best),
    0,
  );

  // grid index 0 = SUN, 1=MON, ..., 6=SAT. Weekdays are MON–FRI (1..5).
  let weekday = 0;
  for (let d = 1; d <= 5; d++) weekday += dayTotals[d] ?? 0;

  let working = 0;
  for (let h = 9; h < 18; h++) working += hourTotals[h] ?? 0;

  let lateNight = 0;
  for (const h of [22, 23, 0, 1, 2, 3]) lateNight += hourTotals[h] ?? 0;

  return {
    topHour: {
      hour: topHourIdx,
      tokens: hourTotals[topHourIdx] ?? 0,
      pct: ((hourTotals[topHourIdx] ?? 0) / total) * 100,
    },
    topDay: {
      day: topDayIdx,
      tokens: dayTotals[topDayIdx] ?? 0,
      pct: ((dayTotals[topDayIdx] ?? 0) / total) * 100,
    },
    weekdayPct: (weekday / total) * 100,
    workingHoursPct: (working / total) * 100,
    lateNightPct: (lateNight / total) * 100,
  };
}
