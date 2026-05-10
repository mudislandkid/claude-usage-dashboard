import { createContext, useContext, useState, type ReactNode } from 'react';
import { rangeToDays, type Range } from './tokens';

interface Ctx {
  range: Range;
  setRange: (r: Range) => void;
}

const RangeCtx = createContext<Ctx>({ range: '30D', setRange: () => {} });

export function RangeProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<Range>('30D');
  return <RangeCtx.Provider value={{ range, setRange }}>{children}</RangeCtx.Provider>;
}

export function useRange() {
  return useContext(RangeCtx);
}

/** Days lookback for the currently-selected range. */
export function useRangeDays(): number {
  return rangeToDays[useContext(RangeCtx).range];
}

/** Human label for inline sub-text inside panels. */
export function useRangeLabel(): string {
  const { range } = useContext(RangeCtx);
  return RANGE_LABEL[range];
}

const RANGE_LABEL: Record<Range, string> = {
  '5H': '5h',
  '24H': '24h',
  '7D': '7d',
  '30D': '30d',
};
