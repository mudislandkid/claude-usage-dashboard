import { TT, TT_MONO } from './tokens';

interface SegBtnProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  accent?: string;
}

export function SegBtn<T extends string>({
  options,
  value,
  onChange,
  accent = TT.green,
}: SegBtnProps<T>) {
  return (
    <div style={{ display: 'flex', border: `1px solid ${TT.border}` }}>
      {options.map((o, i) => {
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            style={{
              background: active ? `${accent}22` : 'transparent',
              color: active ? accent : TT.textMute,
              border: 'none',
              borderRight: i < options.length - 1 ? `1px solid ${TT.border}` : 'none',
              fontFamily: TT_MONO,
              fontSize: 11,
              padding: '7px 14px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
