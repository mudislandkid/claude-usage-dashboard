import type { ReactNode } from 'react';
import { TT, TT_MONO } from './tokens';

interface BadgeProps {
  children: ReactNode;
  color?: string;
  fill?: boolean;
}

export function TBadge({ children, color = TT.green, fill = false }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: TT_MONO,
        fontSize: 10,
        color: fill ? '#08090a' : color,
        background: fill ? color : `${color}1a`,
        border: `1px solid ${color}55`,
        padding: '2px 7px',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </span>
  );
}
