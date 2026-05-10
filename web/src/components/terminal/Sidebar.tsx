import { useNavigate, useLocation } from 'react-router-dom';
import { TT, TT_MONO } from './tokens';

const items = [
  { id: 'dashboard', path: '/', g: 'DSH', label: 'Dashboard' },
  { id: 'projects', path: '/projects', g: 'PRJ', label: 'Projects' },
  { id: 'compare', path: '/compare', g: 'CMP', label: 'Compare' },
  { id: 'settings', path: '/settings', g: 'CFG', label: 'Settings' },
];

export function TSidebar() {
  const nav = useNavigate();
  const loc = useLocation();
  const current = (() => {
    if (loc.pathname === '/') return 'dashboard';
    if (loc.pathname.startsWith('/projects')) return 'projects';
    if (loc.pathname.startsWith('/compare')) return 'compare';
    if (loc.pathname.startsWith('/settings')) return 'settings';
    if (loc.pathname.startsWith('/sessions')) return 'projects';
    return 'dashboard';
  })();

  return (
    <div
      style={{
        width: 60,
        background: TT.bg,
        borderRight: `1px solid ${TT.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '18px 0',
        gap: 8,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          border: `1px solid ${TT.green}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: TT.green,
          fontFamily: TT_MONO,
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 18,
        }}
      >
        C
      </div>
      {items.map((it) => {
        const active = current === it.id;
        return (
          <button
            key={it.id}
            onClick={() => nav(it.path)}
            title={it.label}
            style={{
              width: 44,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: TT_MONO,
              fontSize: 10,
              background: active ? TT.greenSoft : 'transparent',
              borderLeft: active ? `2px solid ${TT.green}` : '2px solid transparent',
              borderTop: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              color: active ? TT.green : TT.textMute,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              transition: 'all 120ms',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = TT.text;
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = TT.textMute;
            }}
          >
            {it.g}
          </button>
        );
      })}
    </div>
  );
}
