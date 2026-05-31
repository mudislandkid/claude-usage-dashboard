import { useState } from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { useCostBreakdown } from '@/hooks/useCostBreakdown';
import { FAST_RATES } from '@/lib/pricing';

interface RatesRow {
  family: 'opus' | 'sonnet' | 'haiku';
  label: string;
}

const ROWS: RatesRow[] = [
  { family: 'opus', label: 'Opus 4.5–4.8' },
  { family: 'sonnet', label: 'Sonnet 4.x' },
  { family: 'haiku', label: 'Haiku 4.5' },
];

export function PricingTooltip() {
  const { data } = useCostBreakdown(30);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const pricing = data.pricing;

  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'help',
        outline: 'none',
        color: TT.textMute,
        fontFamily: TT_MONO,
        fontSize: 10,
        letterSpacing: '0.06em',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          borderRadius: 14,
          border: `1px solid ${TT.border}`,
          color: TT.textMute,
          fontFamily: TT_MONO,
          fontSize: 9,
          fontWeight: 600,
        }}
      >
        i
      </span>
      RATES
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 50,
            background: TT.bgAlt,
            border: `1px solid ${TT.borderHi}`,
            boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
            padding: 14,
            minWidth: 460,
            fontFamily: TT_MONO,
            fontSize: 10,
            color: TT.text,
            lineHeight: 1.4,
          }}
        >
          <div
            style={{
              fontFamily: TT_MONO,
              fontSize: 10,
              color: TT.green,
              letterSpacing: '0.10em',
              marginBottom: 8,
            }}
          >
            ▶ ANTHROPIC API RATES · USD per million tokens
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: TT_MONO,
              fontSize: 11,
            }}
          >
            <thead>
              <tr style={{ color: TT.textDim, fontSize: 9, letterSpacing: '0.08em' }}>
                <th style={th}>MODEL</th>
                <th style={thRight}>INPUT</th>
                <th style={thRight}>OUTPUT</th>
                <th style={thRight}>5m WRITE</th>
                <th style={thRight}>1h WRITE</th>
                <th style={thRight}>READ</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const p = pricing[r.family];
                const color =
                  r.family === 'opus'
                    ? TT.purple
                    : r.family === 'sonnet'
                      ? TT.green
                      : TT.blue;
                return (
                  <tr
                    key={r.family}
                    style={{ borderTop: `1px dashed ${TT.border}` }}
                  >
                    <td style={{ ...td, color }}>{r.label}</td>
                    <td style={tdRight}>{usd(p.input)}</td>
                    <td style={tdRight}>{usd(p.output)}</td>
                    <td style={tdRight}>{usd(p.cacheWrite5m)}</td>
                    <td style={tdRight}>{usd(p.cacheWrite1h)}</td>
                    <td style={tdRight}>{usd(p.cacheRead)}</td>
                  </tr>
                );
              })}
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '10px 0 2px',
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    color: TT.textDim,
                  }}
                >
                  FAST MODE · premium output, when enabled (not in usage data)
                </td>
              </tr>
              {FAST_RATES.map((p) => (
                <tr
                  key={p.label}
                  style={{ borderTop: `1px dashed ${TT.border}` }}
                >
                  <td style={{ ...td, color: TT.textMute }}>{p.label}</td>
                  <td style={{ ...tdRight, color: TT.textMute }}>{usd(p.input)}</td>
                  <td style={{ ...tdRight, color: TT.textMute }}>{usd(p.output)}</td>
                  <td style={{ ...tdRight, color: TT.textMute }}>{usd(p.cacheWrite5m)}</td>
                  <td style={{ ...tdRight, color: TT.textMute }}>{usd(p.cacheWrite1h)}</td>
                  <td style={{ ...tdRight, color: TT.textMute }}>{usd(p.cacheRead)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: `1px dashed ${TT.border}`,
              fontSize: 9,
              color: TT.textDim,
              lineHeight: 1.5,
            }}
          >
            5m cache write = 1.25× input · 1h cache write = 2.00× input · cache
            read = 0.10× input.
            <br />
            Opus 4.5–4.8 cost $5/$25 — down from $15/$75 in legacy 4/4.1, which
            is costed automatically if those model ids appear.
            <br />
            Source: platform.claude.com/docs/en/about-claude/pricing
          </div>
        </div>
      )}
    </span>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px 6px 0',
  fontWeight: 400,
};
const thRight: React.CSSProperties = {
  textAlign: 'right',
  padding: '4px 0 6px 8px',
  fontWeight: 400,
};
const td: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px 6px 0',
  whiteSpace: 'nowrap',
};
const tdRight: React.CSSProperties = {
  textAlign: 'right',
  padding: '6px 0 6px 8px',
  color: TT.text,
  whiteSpace: 'nowrap',
};

function usd(v: number): string {
  return '$' + v.toFixed(2);
}
