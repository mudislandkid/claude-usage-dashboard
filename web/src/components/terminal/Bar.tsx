import { TT } from './tokens';

interface BarProps {
  pct: number;
  color?: string;
  h?: number;
  bg?: string;
}

export function TBar({
  pct,
  color = TT.green,
  h = 4,
  bg = 'rgba(120,200,140,0.06)',
}: BarProps) {
  return (
    <div style={{ width: '100%', height: h, background: bg }}>
      <div
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          height: '100%',
          background: color,
          transition: 'width 300ms ease',
        }}
      />
    </div>
  );
}
