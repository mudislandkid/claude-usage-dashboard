import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { TT } from './tokens';

interface TickerNumProps<T> {
  value: T;
  fmt?: (v: T) => ReactNode;
  color?: string;
  style?: CSSProperties;
}

export function TickerNum<T extends string | number>({
  value,
  fmt = (v) => String(v),
  color = TT.green,
  style,
}: TickerNumProps<T>) {
  const [pulse, setPulse] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      prev.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <span
      style={{
        ...style,
        color,
        transition: 'color 200ms, text-shadow 200ms',
        textShadow: pulse ? `0 0 8px ${color}80` : 'none',
      }}
    >
      {fmt(value)}
    </span>
  );
}
