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
    </TPanel>
  );
}
