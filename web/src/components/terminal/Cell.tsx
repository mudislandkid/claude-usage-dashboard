import type { ReactNode } from 'react';
import { TT, TT_MONO } from './tokens';

interface CellProps {
  label: ReactNode;
  v: ReactNode;
  sub?: ReactNode;
  color?: string;
}

export function TCell({ label, v, sub, color = TT.green }: CellProps) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: TT.textDim,
          letterSpacing: '0.10em',
          marginBottom: 4,
          fontFamily: TT_MONO,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          color,
          fontWeight: 500,
          fontFamily: TT_MONO,
          lineHeight: 1,
        }}
      >
        {v}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: TT.textMute, marginTop: 4, fontFamily: TT_MONO }}>
          {sub}
        </div>
      )}
    </div>
  );
}
