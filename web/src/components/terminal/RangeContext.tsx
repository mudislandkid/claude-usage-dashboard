import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Range } from './tokens';

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
