import { TT } from './tokens';

export function Pulse({ color = TT.green }: { color?: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 7, height: 7 }}>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 4,
          background: color,
          animation: 'tt-pulse 2s ease-in-out infinite',
        }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 4,
          background: color,
          opacity: 0.4,
          animation: 'tt-pulse-ring 2s ease-out infinite',
        }}
      />
    </span>
  );
}
