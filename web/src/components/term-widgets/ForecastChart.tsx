import { useState } from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { useForecast } from '@/hooks/useInsights';
import { formatTokens } from '@/lib/format';

const W = 600;
const H = 200;

export function ForecastPanel() {
  const { data } = useForecast(30);
  const [hover, setHover] = useState<number | null>(null);

  if (!data) return <TPanel title="NEXT_24H_FORECAST">Loading…</TPanel>;
  const values = data.byHour.map((b) => b.expectedChargeable);
  if (values.length === 0) {
    return (
      <TPanel
        title="NEXT_24H_FORECAST"
        sub="// weekday-avg projection"
        action="EST CHARGEABLE"
        accent={TT.blue}
      >
        <div style={{ color: TT.textMute, fontSize: 12 }}>Insufficient history.</div>
      </TPanel>
    );
  }
  const max = Math.max(...values, 1);
  const pts = values.map(
    (v, i) =>
      [
        (i * W) / (values.length - 1 || 1),
        H - (v / max) * (H - 30) - 15,
      ] as const,
  );
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const dFill = d + ` L ${W} ${H - 5} L 0 ${H - 5} Z`;

  // sigma estimate — std-dev/mean
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const sigma = Math.sqrt(variance);
  const sigmaPct = mean > 0 ? Math.round((sigma / mean) * 100) : 0;

  const startHour = data.byHour[0]?.hour ?? 0;
  const tickHours = [0, 6, 12, 18, 23].map((i) => data.byHour[i]?.hour ?? 0);
  const hoverPt = hover !== null ? pts[hover] : null;
  const hoverHour = hover !== null ? data.byHour[hover]?.hour ?? 0 : 0;
  const hoverValue = hover !== null ? values[hover] ?? 0 : 0;

  return (
    <TPanel
      title="NEXT_24H_FORECAST"
      sub={`// weekday-avg · ±${sigmaPct}%`}
      action="EST CHARGEABLE"
      accent={TT.blue}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <span
            style={{
              fontSize: 38,
              color: TT.blue,
              fontWeight: 500,
              fontFamily: TT_MONO,
              lineHeight: 1,
            }}
          >
            {formatTokens(data.totalNext24h)}
          </span>
          <span style={{ fontSize: 11, color: TT.textMute, fontFamily: TT_MONO }}>
            chargeable in next 24h · σ ±{formatTokens(Math.round(sigma))}
          </span>
        </div>
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * W;
            const i = Math.max(
              0,
              Math.min(values.length - 1, Math.round(x / (W / (values.length - 1)))),
            );
            setHover(i);
          }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TT.blue} stopOpacity="0.25" />
              <stop offset="100%" stopColor={TT.blue} stopOpacity="0" />
            </linearGradient>
          </defs>
          {Array.from({ length: 5 }, (_, i) => (
            <line
              key={i}
              y1={(i / 4) * (H - 15)}
              y2={(i / 4) * (H - 15)}
              x1={0}
              x2={W}
              stroke={TT.grid}
            />
          ))}
          <path d={dFill} fill="url(#fcGrad)" />
          <path d={d} fill="none" stroke={TT.blue} strokeWidth={1.4} />
          {pts.map((p, i) => (
            <circle
              key={i}
              cx={p[0]}
              cy={p[1]}
              r={hover === i ? 3 : 1.5}
              fill={hover === i ? TT.cyan : TT.blue}
              style={{ transition: 'r 120ms' }}
            />
          ))}
          {hoverPt && (
            <g>
              <line
                x1={hoverPt[0]}
                x2={hoverPt[0]}
                y1={0}
                y2={H - 5}
                stroke={TT.cyan}
                strokeOpacity={0.3}
                strokeDasharray="2 2"
              />
              <rect
                x={hoverPt[0] + 6 > W - 100 ? hoverPt[0] - 100 : hoverPt[0] + 6}
                y={Math.max(0, hoverPt[1] - 30)}
                width={92}
                height={26}
                fill={TT.bgAlt}
                stroke={TT.borderHi}
              />
              <text
                x={hoverPt[0] + 6 > W - 100 ? hoverPt[0] - 94 : hoverPt[0] + 12}
                y={Math.max(0, hoverPt[1] - 30) + 12}
                fontFamily={TT_MONO}
                fontSize={9}
                fill={TT.textMute}
              >
                {String(hoverHour).padStart(2, '0')}:00
              </text>
              <text
                x={hoverPt[0] + 6 > W - 100 ? hoverPt[0] - 94 : hoverPt[0] + 12}
                y={Math.max(0, hoverPt[1] - 30) + 22}
                fontFamily={TT_MONO}
                fontSize={10}
                fill={TT.cyan}
              >
                {formatTokens(hoverValue)}
              </text>
            </g>
          )}
        </svg>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: TT_MONO,
            fontSize: 9,
            color: TT.textDim,
            marginTop: 4,
          }}
        >
          {tickHours.map((h, i) => (
            <span key={i}>{String(h).padStart(2, '0')}:00</span>
          ))}
        </div>
        <div style={{ fontSize: 9, color: TT.textDim, marginTop: 4 }}>
          starts at hour {startHour}:00 local
        </div>
      </div>
    </TPanel>
  );
}
