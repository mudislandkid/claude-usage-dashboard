import type { CSSProperties, ReactNode } from 'react';
import { TT, TT_MONO } from './tokens';

interface PanelProps {
  children?: ReactNode;
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  style?: CSSProperties;
  accent?: string;
  padded?: boolean;
}

export function TPanel({
  children,
  title,
  sub,
  action,
  style,
  accent = TT.green,
  padded = true,
}: PanelProps) {
  return (
    <div
      style={{
        background: TT.panel,
        border: `1px solid ${TT.border}`,
        position: 'relative',
        ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            borderBottom: `1px solid ${TT.border}`,
            background: 'rgba(120,200,140,0.018)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
            <span
              style={{
                color: accent,
                fontSize: 11,
                fontFamily: TT_MONO,
                letterSpacing: '0.10em',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              ▶ {title}
            </span>
            {sub && (
              <span
                style={{
                  color: TT.textDim,
                  fontSize: 10,
                  fontFamily: TT_MONO,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {sub}
              </span>
            )}
          </div>
          {action && (
            <span
              style={{
                color: TT.textMute,
                fontSize: 10,
                fontFamily: TT_MONO,
                letterSpacing: '0.06em',
                whiteSpace: 'nowrap',
                marginLeft: 12,
              }}
            >
              {action}
            </span>
          )}
        </div>
      )}
      <div style={{ padding: padded ? 18 : 0 }}>{children}</div>
    </div>
  );
}
