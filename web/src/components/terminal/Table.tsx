import { useState } from 'react';
import type { ReactNode } from 'react';
import { TT, TT_MONO } from './tokens';

export interface TColumn<R> {
  key: string;
  label: ReactNode;
  w?: string;
  align?: 'left' | 'right' | 'center';
  color?: (r: R) => string;
  render?: (r: R, hover: boolean) => ReactNode;
}

interface TableProps<R> {
  columns: TColumn<R>[];
  rows: R[];
  onRowClick?: (r: R) => void;
  empty?: ReactNode;
}

export function TTable<R>({
  columns,
  rows,
  onRowClick,
  empty,
}: TableProps<R>) {
  const [hover, setHover] = useState<number | null>(null);
  const grid = columns.map((c) => c.w || '1fr').join(' ');

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: grid,
          gap: 12,
          padding: '0 4px 10px',
          borderBottom: `1px dashed ${TT.border}`,
          fontSize: 9,
          color: TT.textDim,
          fontFamily: TT_MONO,
          letterSpacing: '0.10em',
        }}
      >
        {columns.map((c) => (
          <span key={c.key} style={{ textAlign: c.align || 'left' }}>
            {c.label}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.length === 0 && empty && (
          <div
            style={{
              padding: '14px 4px',
              fontFamily: TT_MONO,
              fontSize: 11,
              color: TT.textMute,
            }}
          >
            {empty}
          </div>
        )}
        {rows.map((r, i) => (
          <div
            key={i}
            onClick={() => onRowClick && onRowClick(r)}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              gap: 12,
              padding: '9px 4px',
              fontSize: 12,
              fontFamily: TT_MONO,
              background: hover === i ? TT.greenSoft : 'transparent',
              borderLeft: hover === i ? `2px solid ${TT.green}` : '2px solid transparent',
              cursor: onRowClick ? 'pointer' : 'default',
              transition: 'background 80ms',
            }}
          >
            {columns.map((c) => (
              <span
                key={c.key}
                style={{
                  textAlign: c.align || 'left',
                  color: c.color ? c.color(r) : TT.text,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {c.render
                  ? c.render(r, hover === i)
                  : ((r as Record<string, unknown>)[c.key] as ReactNode)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
