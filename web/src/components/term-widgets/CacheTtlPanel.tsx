import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TBar } from '@/components/terminal/Bar';
import { TCell } from '@/components/terminal/Cell';
import { useRangeDays, useRangeLabel } from '@/components/terminal/RangeContext';
import { useCacheTtlEfficiency } from '@/hooks/useCacheTtl';
import { formatTokens } from '@/lib/format';
import { fmtUSD } from '@/lib/pricing';

export function CacheTtlPanel() {
  const days = useRangeDays();
  const label = useRangeLabel();
  const { data } = useCacheTtlEfficiency(days);
  if (!data) return <TPanel title="CACHE_TTL_EFFICIENCY">Loading…</TPanel>;

  const t = data.totals;
  const c = data.classification;
  const totalAnalyzed = c.usefulTokens + c.wasted5mTokens + c.staleTokens;
  const wastePct = totalAnalyzed > 0 ? ((c.wasted5mTokens + c.staleTokens) / totalAnalyzed) * 100 : 0;
  const share5m = (t.tokens5m / (t.tokens5m + t.tokens1h || 1)) * 100;
  const share1h = 100 - share5m;
  const usefulPct = totalAnalyzed > 0 ? (c.usefulTokens / totalAnalyzed) * 100 : 0;
  const wastedPct = totalAnalyzed > 0 ? (c.wasted5mTokens / totalAnalyzed) * 100 : 0;
  const stalePct = totalAnalyzed > 0 ? (c.staleTokens / totalAnalyzed) * 100 : 0;

  return (
    <TPanel
      title="CACHE_TTL_EFFICIENCY"
      sub={`// ${label} · 5m vs 1h TTL classification`}
      action={`WASTED ${wastePct.toFixed(1)}%`}
      accent={TT.amber}
    >
      <div
        style={{
          fontFamily: TT_MONO,
          fontSize: 11,
          color: TT.textMute,
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        Anthropic's prompt cache supports two TTLs: 5-minute (1.25× input cost) and 1-hour
        (2.0× input cost — a 60% premium). Claude Code picks the TTL; users can't override.
        A 1h write only pays back if a cache read lands between 5 and 60 min later — otherwise
        the premium was avoidable.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <TCell label="1H_WRITES_WASTED" v={wastePct.toFixed(1) + '%'} sub="of 1h premium" color={TT.amber} />
        <TCell
          label="1H_TOKENS"
          v={formatTokens(t.tokens1h)}
          sub={`${t.writes1h.toLocaleString()} writes`}
          color={TT.green}
        />
        <TCell
          label="API_$_PREMIUM"
          v={fmtUSD(data.cost.totalPremiumUsdMonthly)}
          sub="projected · 30d"
          color={TT.red}
        />
        <TCell label="YOUR_COST" v="$0.00" sub="covered by subscription" color={TT.greenBright} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontFamily: TT_MONO,
            fontSize: 10,
            color: TT.textDim,
            letterSpacing: '0.08em',
            marginBottom: 8,
          }}
        >
          VOLUME BY TTL
        </div>
        <div style={{ display: 'flex', height: 18, gap: 2 }}>
          <div
            style={{
              flex: Math.max(0.01, share5m),
              background: TT.amber,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: TT_MONO,
              fontSize: 10,
              color: '#08090a',
              minWidth: 24,
            }}
          >
            {share5m > 8 ? `5-MIN · ${share5m.toFixed(0)}%` : ''}
          </div>
          <div
            style={{
              flex: Math.max(0.01, share1h),
              background: TT.green,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: TT_MONO,
              fontSize: 10,
              color: '#08090a',
              minWidth: 24,
            }}
          >
            {share1h > 8 ? `1-HOUR · ${share1h.toFixed(0)}%` : ''}
          </div>
        </div>
        <div style={{ fontFamily: TT_MONO, fontSize: 10, color: TT.textMute, marginTop: 6 }}>
          {share1h.toFixed(0)}% of cache writes use the 1h TTL — the more expensive option.
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontFamily: TT_MONO,
            fontSize: 10,
            color: TT.textDim,
            letterSpacing: '0.08em',
            marginBottom: 8,
          }}
        >
          1H WRITES — STRICT CLASSIFICATION
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ClassRow
            label="Useful"
            sub="cache read 5—60 min later"
            color={TT.green}
            pct={usefulPct}
            tokens={c.usefulTokens}
            writes={c.usefulWrites}
          />
          <ClassRow
            label="Wasted"
            sub="only reads <5 min after"
            color={TT.amber}
            pct={wastedPct}
            tokens={c.wasted5mTokens}
            writes={c.wasted5mWrites}
          />
          <ClassRow
            label="Stale"
            sub="no cache read in 5—60 min"
            color={TT.red}
            pct={stalePct}
            tokens={c.staleTokens}
            writes={c.staleWrites}
          />
        </div>
      </div>

      <div>
        <div
          style={{
            fontFamily: TT_MONO,
            fontSize: 10,
            color: TT.textDim,
            letterSpacing: '0.08em',
            marginBottom: 8,
          }}
        >
          TIME TO NEXT CACHE READ — 1H WRITES
        </div>
        <TtncrChart histogram={data.histogram} />
      </div>
    </TPanel>
  );
}

interface ClassRowProps {
  label: string;
  sub: string;
  color: string;
  pct: number;
  tokens: number;
  writes: number;
}

function ClassRow({ label, sub, color, pct, tokens, writes }: ClassRowProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr 140px',
        alignItems: 'center',
        gap: 12,
        fontFamily: TT_MONO,
        fontSize: 11,
      }}
    >
      <span style={{ width: 60, color }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: TT.textMute, fontSize: 10, whiteSpace: 'nowrap' }}>— {sub}</span>
        <div style={{ flex: 1 }}>
          <TBar pct={pct} color={color} h={6} />
        </div>
      </div>
      <span style={{ textAlign: 'right', color }}>
        {formatTokens(tokens)} ({writes.toLocaleString()})
      </span>
    </div>
  );
}

function TtncrChart({ histogram }: { histogram: Array<{ bucket: string; tokens: number }> }) {
  const max = Math.max(...histogram.map((d) => d.tokens), 1);
  const wasted = new Set(['<1m', '1–5m']);
  const useful = new Set(['5–15m', '15–30m', '30–60m']);

  function colorFor(bucket: string) {
    if (wasted.has(bucket)) return TT.amber;
    if (useful.has(bucket)) return TT.green;
    return TT.red;
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          height: 100,
          padding: '0 4px',
        }}
      >
        {histogram.map((d) => {
          const color = colorFor(d.bucket);
          return (
            <div
              key={d.bucket}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontFamily: TT_MONO, fontSize: 9, color }}>
                {d.tokens >= 1e6 ? (d.tokens / 1e6).toFixed(1) + 'M' : (d.tokens / 1e3).toFixed(0) + 'k'}
              </span>
              <div
                style={{
                  width: '100%',
                  height: (d.tokens / max) * 78,
                  background: color,
                  opacity: 0.85,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: '8px 4px 0',
          borderTop: `1px dashed ${TT.border}`,
        }}
      >
        {histogram.map((d) => (
          <div
            key={d.bucket}
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: TT_MONO,
              fontSize: 9,
              color: TT.textMute,
            }}
          >
            {d.bucket}
          </div>
        ))}
      </div>
      <div
        style={{
          fontFamily: TT_MONO,
          fontSize: 10,
          color: TT.textMute,
          marginTop: 10,
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: TT.amber }}>■</span> wasted (read &lt;5 min) ·{' '}
        <span style={{ color: TT.green }}>■</span> useful (5—60 min window) ·{' '}
        <span style={{ color: TT.red }}>■</span> stale (&gt;60 min or never)
      </div>
    </div>
  );
}
