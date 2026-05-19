import type React from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { formatDayLabel } from '@/lib/forecastDate';

interface Props {
  date: string;
  today: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onShift: (delta: number) => void;
  onReset: () => void;
}

export function DayNavigator({ date, today, canGoBack, canGoForward, onShift, onReset }: Props) {
  const label = formatDayLabel(date, today);
  const btnStyle = (enabled: boolean): React.CSSProperties => ({
    background: 'transparent',
    border: 'none',
    color: enabled ? TT.text : TT.textDim,
    cursor: enabled ? 'pointer' : 'default',
    fontFamily: TT_MONO,
    fontSize: 12,
    padding: '0 6px',
    letterSpacing: '0.1em',
  });
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: TT_MONO,
        fontSize: 10,
        color: TT.textMute,
        letterSpacing: '0.06em',
      }}
    >
      <button
        type="button"
        aria-label="Previous day"
        disabled={!canGoBack}
        onClick={() => canGoBack && onShift(-1)}
        style={btnStyle(canGoBack)}
      >
        ‹
      </button>
      <button
        type="button"
        onClick={onReset}
        aria-label="Reset to today"
        style={{ ...btnStyle(true), color: TT.text, minWidth: 88, textAlign: 'center' }}
      >
        {label}
      </button>
      <button
        type="button"
        aria-label="Next day"
        disabled={!canGoForward}
        onClick={() => canGoForward && onShift(1)}
        style={btnStyle(canGoForward)}
      >
        ›
      </button>
    </span>
  );
}
