import { useLocation } from 'react-router-dom';
import { TT, TT_MONO } from './tokens';

const TITLES: Record<string, { t: string; s: string }> = {
  dashboard: { t: 'DASHBOARD', s: '// realtime usage telemetry' },
  projects: { t: 'PROJECTS', s: '// all observed claude code sessions' },
  compare: { t: 'COMPARE', s: '// side-by-side project diff' },
  settings: { t: 'SETTINGS', s: '// bridge · oauth · thresholds' },
  session: { t: 'SESSION', s: '// per-session breakdown' },
  projectDetail: { t: 'PROJECT', s: '// per-project deep dive' },
};

export function TPageHeader() {
  const loc = useLocation();
  const key = (() => {
    if (loc.pathname === '/') return 'dashboard';
    if (loc.pathname.startsWith('/projects/')) return 'projectDetail';
    if (loc.pathname.startsWith('/projects')) return 'projects';
    if (loc.pathname.startsWith('/compare')) return 'compare';
    if (loc.pathname.startsWith('/sessions')) return 'session';
    if (loc.pathname.startsWith('/settings')) return 'settings';
    return 'dashboard';
  })();
  const cur = TITLES[key] ?? TITLES.dashboard!;

  return (
    <div
      style={{
        padding: '14px 24px',
        borderBottom: `1px solid ${TT.border}`,
        display: 'flex',
        alignItems: 'baseline',
        gap: 14,
        background: TT.bg,
      }}
    >
      <span
        style={{
          color: TT.green,
          fontSize: 18,
          fontWeight: 500,
          fontFamily: TT_MONO,
          letterSpacing: '0.06em',
        }}
      >
        {cur.t}
        <span className="tt-blink" style={{ marginLeft: 6 }}>
          █
        </span>
      </span>
      <span style={{ color: TT.textDim, fontSize: 11, fontFamily: TT_MONO }}>{cur.s}</span>
    </div>
  );
}
