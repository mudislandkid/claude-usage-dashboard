import { TT, TT_MONO, type Range } from './tokens';

const OPTS: Range[] = ['5H', '24H', '7D', '30D'];

interface Props {
  value: Range;
  onChange: (v: Range) => void;
}

export function RangePicker({ value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', border: `1px solid ${TT.border}` }}>
      {OPTS.map((o, i) => {
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            style={{
              background: active ? TT.greenSoft : 'transparent',
              color: active ? TT.green : TT.textMute,
              border: 'none',
              borderRight: i < OPTS.length - 1 ? `1px solid ${TT.border}` : 'none',
              fontFamily: TT_MONO,
              fontSize: 10,
              padding: '5px 10px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
