import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TCell } from '@/components/terminal/Cell';
import { TickerNum } from '@/components/terminal/Ticker';
import { useWindow } from '@/hooks/useWindow';
import { formatTokens, formatDuration } from '@/lib/format';

export function FiveHourGaugePanel() {
  const { data } = useWindow();
  if (!data) return <TPanel title="5H_ROLLING_WINDOW">Loading…</TPanel>;

  const pct = Math.min(100, data.percentUsed * 100);
  const used = data.totalChargeable;
  const limit = data.effectiveLimitTokens;
  const burn = data.burnRatePerMin;
  const headroom = Math.max(0, limit - used);
  const cacheReads = data.cacheReadTokens;

  const resetMs = data.minutesToReset;
  const resetsIn = resetMs !== null ? formatDuration(resetMs) : '—';
  const resetAt = data.bridge.fiveHourResetsAt || data.windowEnd;
  const resetAtLabel = resetAt
    ? new Date(resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';
  const headroomColor = pct >= 90 ? TT.red : pct >= 75 ? TT.amber : TT.greenBright;
  const source = data.bridge.active ? '// live anthropic bridge' : '// estimated from jsonl';

  // Window-average burn rate: tokens consumed / minutes elapsed since window start.
  // More stable than the 15-min instantaneous burn for projecting where 5h ends up.
  const projection = (() => {
    if (!data.windowActive || !data.windowStart || used <= 0) return null;
    const elapsedMin = (Date.now() - new Date(data.windowStart).getTime()) / 60_000;
    if (elapsedMin < 2) return null;
    const avgBurn = used / elapsedMin;
    if (avgBurn <= 0) return null;
    const minsToLimitAvg = headroom / avgBurn;
    const willHit = resetMs !== null && minsToLimitAvg < resetMs;
    const hitAt = new Date(Date.now() + minsToLimitAvg * 60_000);
    const leadMin = resetMs !== null ? resetMs - minsToLimitAvg : null;
    return { avgBurn, minsToLimitAvg, willHit, hitAt, leadMin };
  })();

  return (
    <TPanel
      title="5H_ROLLING_WINDOW"
      sub={source}
      action={`USED ${formatTokens(used)}`}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
          <TickerNum
            value={pct}
            fmt={(v) => v.toFixed(1) + '%'}
            color={pct >= 90 ? TT.red : pct >= 75 ? TT.amber : TT.green}
            style={{ fontSize: 38, fontWeight: 500, fontFamily: TT_MONO, lineHeight: 1 }}
          />
          <span style={{ fontFamily: TT_MONO, fontSize: 11, color: TT.textMute }}>
            {formatTokens(used)} / {formatTokens(limit)} chargeable
          </span>
        </div>
        <div
          style={{
            position: 'relative',
            height: 22,
            background: 'rgba(120,200,140,0.05)',
            border: `1px solid ${TT.border}`,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: `repeating-linear-gradient(90deg, ${TT.green}, ${TT.green} 5px, rgba(74,222,128,0.6) 5px, rgba(74,222,128,0.6) 7px)`,
              transition: 'width 400ms ease',
            }}
          />
          {[25, 50, 75].map((p) => (
            <div
              key={p}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${p}%`,
                width: 1,
                background: 'rgba(255,255,255,0.08)',
              }}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              top: -2,
              bottom: -2,
              left: '80%',
              width: 1,
              background: TT.amber,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -14,
                left: 4,
                fontFamily: TT_MONO,
                fontSize: 9,
                color: TT.amber,
              }}
            >
              WARN 80%
            </span>
          </div>
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
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span style={{ color: TT.red }}>100% CAP</span>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginTop: 18,
          paddingTop: 16,
          borderTop: `1px dashed ${TT.border}`,
        }}
      >
        <TCell label="RESETS_IN" v={resetsIn} sub={`@ ${resetAtLabel}`} color={TT.green} />
        <TCell
          label="BURN_RATE"
          v={
            <TickerNum
              value={Math.round(burn)}
              fmt={(v) => formatTokens(v)}
              color={TT.green}
            />
          }
          sub="tok/min · last 15m"
          color={TT.green}
        />
        <TCell
          label="CACHE_RD"
          v={formatTokens(cacheReads)}
          sub="free reads"
          color={TT.blue}
        />
        <TCell
          label="HEADROOM"
          v={formatTokens(headroom)}
          sub={pct >= 90 ? 'red zone' : pct >= 75 ? 'warning' : 'on track'}
          color={headroomColor}
        />
      </div>
      {projection && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: `1px dashed ${TT.border}`,
            fontFamily: TT_MONO,
            fontSize: 11,
            color: TT.textMute,
            lineHeight: 1.5,
          }}
        >
          {projection.willHit ? (
            <>
              <span style={{ color: TT.red }}>▸ </span>
              projected to hit <span style={{ color: TT.red }}>100%</span> in{' '}
              <span style={{ color: TT.red }}>
                {formatDuration(projection.minsToLimitAvg)}
              </span>{' '}
              ·{' '}
              <span style={{ color: TT.red }}>
                {projection.hitAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
              </span>
              {projection.leadMin !== null && projection.leadMin > 0 && (
                <>
                  {' · '}
                  <span style={{ color: TT.amber }}>
                    ~{formatDuration(projection.leadMin)}
                  </span>{' '}
                  before reset{' '}
                  <span style={{ color: TT.textDim }}>({resetAtLabel})</span>
                </>
              )}
              <div style={{ fontSize: 9, color: TT.textDim, marginTop: 4 }}>
                avg burn since window start: {formatTokens(Math.round(projection.avgBurn))}
                /min
              </div>
            </>
          ) : (
            <>
              <span style={{ color: TT.green }}>▸ </span>
              on track at window-average burn —{' '}
              <span style={{ color: TT.green }}>
                {formatTokens(Math.round(projection.avgBurn))}/min
              </span>
              {resetMs !== null && (
                <>
                  {' · '}
                  projected{' '}
                  <span style={{ color: TT.green }}>
                    {formatTokens(
                      Math.round(used + projection.avgBurn * resetMs),
                    )}
                  </span>{' '}
                  by reset
                </>
              )}
            </>
          )}
        </div>
      )}
    </TPanel>
  );
}
