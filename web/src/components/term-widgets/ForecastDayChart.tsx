import { useState } from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { formatTokens } from '@/lib/format';
import type { ForecastDayResponse } from '@/hooks/useInsights';

const W = 600;
const H = 200;

interface Props {
  data: ForecastDayResponse;
}

export function ForecastDayChart({ data }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const forecast = data.byHour.map((b) => b.expectedChargeable);
  const actuals = data.byHour.map((b) => b.actualChargeable);

  const maxVal = Math.max(
    ...forecast,
    ...actuals.map((v) => (v ?? 0)),
    1,
  );

  const xFor = (i: number) => (i * W) / 23;
  const yFor = (v: number) => H - (v / maxVal) * (H - 30) - 15;

  const forecastPts = forecast.map((v, i) => [xFor(i), yFor(v)] as const);
  const forecastD = forecastPts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))
    .join(' ');
  const forecastFill = forecastD + ` L ${W} ${H - 5} L 0 ${H - 5} Z`;

  // Build actual path only over consecutive non-null hours
  const actualSegments: Array<Array<readonly [number, number]>> = [];
  let current: Array<readonly [number, number]> = [];
  for (let i = 0; i < 24; i++) {
    const v = actuals[i];
    if (v === null || v === undefined) {
      if (current.length) actualSegments.push(current);
      current = [];
    } else {
      current.push([xFor(i), yFor(v)] as const);
    }
  }
  if (current.length) actualSegments.push(current);
  const actualPaths = actualSegments.map((seg) =>
    seg.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '),
  );
  // Build a single filled area beneath the actual line if we have any segment
  let actualFill: string | null = null;
  if (actualSegments.length && actualSegments[0] && actualSegments[0].length > 1) {
    const all = actualSegments.flat();
    const first = all[0];
    const last = all[all.length - 1];
    if (first && last) {
      actualFill =
        all
          .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))
          .join(' ') +
        ` L ${last[0]} ${H - 5} L ${first[0]} ${H - 5} Z`;
    }
  }

  const tickHours = [0, 6, 12, 18, 23];
  const nowX = data.currentHour !== null ? xFor(data.currentHour) : null;
  const hoverF = hover !== null ? (forecast[hover] ?? 0) : 0;
  const hoverA = hover !== null ? (actuals[hover] ?? null) : null;
  const hoverPt = hover !== null ? (forecastPts[hover] ?? null) : null;

  return (
    <div>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const i = Math.max(0, Math.min(23, Math.round(x / (W / 23))));
          setHover(i);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TT.blue} stopOpacity="0.25" />
            <stop offset="100%" stopColor={TT.blue} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TT.green} stopOpacity="0.25" />
            <stop offset="100%" stopColor={TT.green} stopOpacity="0" />
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

        <path d={forecastFill} fill="url(#fcGrad)" />
        <path d={forecastD} fill="none" stroke={TT.blue} strokeWidth={1.4} />

        {actualFill && <path d={actualFill} fill="url(#acGrad)" />}
        {actualPaths.map((d, i) => (
          <path key={`a${i}`} d={d} fill="none" stroke={TT.green} strokeWidth={1.6} />
        ))}

        {forecastPts.map((p, i) => (
          <circle
            key={`fp${i}`}
            cx={p[0]}
            cy={p[1]}
            r={hover === i ? 3 : 1.5}
            fill={hover === i ? TT.cyan : TT.blue}
            style={{ transition: 'r 120ms' }}
          />
        ))}
        {actuals.map((v, i) =>
          v === null || v === undefined ? null : (
            <circle
              key={`ap${i}`}
              cx={xFor(i)}
              cy={yFor(v)}
              r={hover === i ? 3 : 1.5}
              fill={hover === i ? TT.greenBright : TT.green}
              style={{ transition: 'r 120ms' }}
            />
          ),
        )}

        {nowX !== null && (
          <g>
            <line
              x1={nowX}
              x2={nowX}
              y1={0}
              y2={H - 5}
              stroke={TT.textMute}
              strokeOpacity={0.45}
              strokeDasharray="3 3"
            />
            <text x={nowX + 4} y={11} fontFamily={TT_MONO} fontSize={9} fill={TT.textMute}>
              NOW
            </text>
          </g>
        )}

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
              x={hoverPt[0] + 6 > W - 120 ? hoverPt[0] - 120 : hoverPt[0] + 6}
              y={Math.max(0, hoverPt[1] - 42)}
              width={114}
              height={hoverA !== null ? 38 : 26}
              fill={TT.bgAlt}
              stroke={TT.borderHi}
            />
            <text
              x={hoverPt[0] + 6 > W - 120 ? hoverPt[0] - 114 : hoverPt[0] + 12}
              y={Math.max(0, hoverPt[1] - 42) + 12}
              fontFamily={TT_MONO}
              fontSize={9}
              fill={TT.textMute}
            >
              {String(hover).padStart(2, '0')}:00
            </text>
            <text
              x={hoverPt[0] + 6 > W - 120 ? hoverPt[0] - 114 : hoverPt[0] + 12}
              y={Math.max(0, hoverPt[1] - 42) + 22}
              fontFamily={TT_MONO}
              fontSize={10}
              fill={TT.blue}
            >
              fcst {formatTokens(hoverF)}
            </text>
            {hoverA !== null && (
              <text
                x={hoverPt[0] + 6 > W - 120 ? hoverPt[0] - 114 : hoverPt[0] + 12}
                y={Math.max(0, hoverPt[1] - 42) + 33}
                fontFamily={TT_MONO}
                fontSize={10}
                fill={TT.green}
              >
                act  {formatTokens(hoverA)}
              </text>
            )}
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
        {tickHours.map((h) => (
          <span key={h}>{String(h).padStart(2, '0')}:00</span>
        ))}
      </div>

      {data.totalActual !== null && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            fontFamily: TT_MONO,
            fontSize: 10,
            color: TT.textMute,
            marginTop: 8,
          }}
        >
          <span>
            <span style={{ color: TT.blue }}>■</span> forecast
          </span>
          <span>
            <span style={{ color: TT.green }}>■</span> actual
          </span>
        </div>
      )}
    </div>
  );
}
