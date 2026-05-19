import { useState, useMemo } from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { useForecastDay } from '@/hooks/useInsights';
import { formatTokens } from '@/lib/format';
import { todayLocal, shiftDate, daysBetween } from '@/lib/forecastDate';
import { DayNavigator } from './DayNavigator';
import { ForecastDayChart } from './ForecastDayChart';

export function ForecastPanel() {
  // null = "follow today"; explicit string = pinned date
  const [pinned, setPinned] = useState<string | null>(null);
  const today = todayLocal();
  const date = pinned ?? today;
  const { data, isLoading } = useForecastDay(date);

  const canGoBack = useMemo(() => daysBetween(date, today) < 7, [date, today]);
  const canGoForward = useMemo(() => daysBetween(today, date) < 1, [date, today]);

  const shift = (delta: number) => {
    const next = shiftDate(date, delta);
    setPinned(next === today ? null : next);
  };

  const action = (
    <DayNavigator
      date={date}
      today={today}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onShift={shift}
      onReset={() => setPinned(null)}
    />
  );

  if (!data) {
    return (
      <TPanel title="FORECAST_24H" sub="// weekday-avg" action={action} accent={TT.blue}>
        {isLoading ? 'Loading…' : <span style={{ color: TT.textMute }}>No data.</span>}
      </TPanel>
    );
  }

  let headline: { value: number; color: string };
  let subLine: string;
  if (data.isPast && data.totalActual !== null) {
    const variance =
      data.totalForecast > 0
        ? Math.round(((data.totalActual - data.totalForecast) / data.totalForecast) * 100)
        : 0;
    const sign = variance > 0 ? '+' : '';
    headline = { value: data.totalActual, color: TT.green };
    subLine = `actual · vs ${formatTokens(data.totalForecast)} forecast (${sign}${variance}%)`;
  } else if (data.isToday && data.totalActual !== null) {
    headline = { value: data.totalForecast, color: TT.blue };
    subLine = `${formatTokens(data.totalActual)} actual so far · ${formatTokens(data.totalForecast)} forecast`;
  } else {
    headline = { value: data.totalForecast, color: TT.blue };
    subLine = `chargeable forecast`;
  }

  const sub = data.isPast
    ? '// recomputed from history'
    : data.isToday
      ? '// snapshot · live actuals'
      : '// weekday-avg projection';

  return (
    <TPanel title="FORECAST_24H" sub={sub} action={action} accent={TT.blue}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <span
            style={{
              fontSize: 38,
              color: headline.color,
              fontWeight: 500,
              fontFamily: TT_MONO,
              lineHeight: 1,
            }}
          >
            {formatTokens(headline.value)}
          </span>
          <span style={{ fontSize: 11, color: TT.textMute, fontFamily: TT_MONO }}>
            {subLine}
          </span>
        </div>
        <ForecastDayChart data={data} />
      </div>
    </TPanel>
  );
}
