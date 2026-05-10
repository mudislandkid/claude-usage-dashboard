import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TickerNum } from '@/components/terminal/Ticker';
import { useRangeDays, useRangeLabel } from '@/components/terminal/RangeContext';
import { useWindow } from '@/hooks/useWindow';
import { useWeekly } from '@/hooks/useWeekly';
import { useCacheScore } from '@/hooks/useCacheScore';
import { useForecast } from '@/hooks/useInsights';
import { useCacheTtlEfficiency } from '@/hooks/useCacheTtl';
import { useCostBreakdown } from '@/hooks/useCostBreakdown';
import { useCurrentPlan } from '@/hooks/useCurrentPlan';
import { formatTokens } from '@/lib/format';
import { fmtUSDCompact } from '@/lib/pricing';

export function DashboardTicker() {
  const days = useRangeDays();
  const label = useRangeLabel().toUpperCase();
  const { data: win } = useWindow();
  const { data: wk } = useWeekly();
  const { data: cache } = useCacheScore(days);
  // Forecast always uses ~30d history; the prediction itself is fixed at "next 24h".
  const { data: forecast } = useForecast(30);
  const { data: ttl } = useCacheTtlEfficiency(days);
  const { data: cost } = useCostBreakdown(days);
  const plan = useCurrentPlan();

  const apiEq = cost?.total.totalUsd ?? 0;
  const planForRange = ((plan?.monthly ?? 0) * days) / 30;
  const savings = apiEq - planForRange;

  const burnPerMin = win?.burnRatePerMin ?? 0;
  const pct = (win?.percentUsed ?? 0) * 100;

  // Cache TTL premium — server returns "monthly" projection regardless of
  // lookback, so scale back to the active range.
  const ttlWaste = ((ttl?.cost.totalPremiumUsdMonthly ?? 0) * days) / 30;

  const allWeekly = wk?.allModels?.percent ?? null;
  const sonnetWeekly = wk?.sonnet?.percent ?? null;

  const minsLeft = win?.minutesToReset ?? null;
  const reset = minsLeft !== null ? `${Math.floor(minsLeft / 60)}h ${Math.round(minsLeft % 60)}m` : '—';

  const ticks = [
    { k: '5H', v: pct.toFixed(1) + '%', color: TT.green },
    {
      k: '7D ALL',
      v: allWeekly !== null ? allWeekly.toFixed(1) + '%' : '—',
      color: TT.green,
    },
    {
      k: '7D SON',
      v: sonnetWeekly !== null ? sonnetWeekly.toFixed(1) + '%' : '—',
      color: TT.purple,
    },
    {
      k: 'BURN',
      v: formatTokens(Math.round(burnPerMin)) + '/m',
      color: TT.blue,
    },
    { k: 'RESET', v: reset, color: TT.text },
    {
      k: `CACHE (${label})`,
      v: cache?.overall ? (cache.overall.effectiveness * 100).toFixed(1) + '%' : '—',
      color: TT.green,
    },
    {
      k: '24H FCST',
      v: forecast ? formatTokens(forecast.totalNext24h) : '—',
      color: TT.blue,
    },
    {
      k: `API EQUIV (${label})`,
      v: fmtUSDCompact(apiEq),
      color: TT.greenBright,
    },
    {
      k: `SAVED VS API (${label})`,
      v: fmtUSDCompact(savings),
      color: savings >= 0 ? TT.greenBright : TT.amber,
    },
    {
      k: `WASTE COST (${label})`,
      v: fmtUSDCompact(ttlWaste),
      color: TT.amber,
    },
  ];

  return (
    <div style={{ display: 'flex', fontFamily: TT_MONO, fontSize: 11, flexWrap: 'wrap' }}>
      {ticks.map((t, i) => (
        <div
          key={t.k}
          style={{
            flex: '1 1 130px',
            minWidth: 130,
            padding: '10px 16px',
            borderRight: i < ticks.length - 1 ? `1px solid ${TT.border}` : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ color: TT.textDim, fontSize: 9, letterSpacing: '0.10em' }}>{t.k}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <TickerNum
              value={t.v}
              fmt={(v) => v}
              color={t.color}
              style={{ fontSize: 13, fontWeight: 500 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
