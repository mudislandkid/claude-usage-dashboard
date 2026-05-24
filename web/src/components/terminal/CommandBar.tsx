import { useEffect, useState } from 'react';
import { TT, TT_MONO, type Range } from './tokens';
import { RangePicker } from './RangePicker';
import { Pulse } from './Pulse';
import { useWindow } from '@/hooks/useWindow';
import { useWeekly } from '@/hooks/useWeekly';
import { useCurrentPlan } from '@/hooks/useCurrentPlan';
import { APP_VERSION } from '@/lib/version';

interface Props {
  onOpenPalette: () => void;
  range: Range;
  onRange: (r: Range) => void;
}

export function TCommandBar({ onOpenPalette, range, onRange }: Props) {
  const [now, setNow] = useState(new Date());
  const { data: win } = useWindow();
  const { data: wk } = useWeekly();
  const plan = useCurrentPlan();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const ts = now.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const bridgeActive = win?.bridge.active ?? false;
  const oauthActive = wk?.oauth.enabled && wk?.oauth.credentialsPresent;

  const planLabel = plan ? plan.name.toLowerCase().replace(' ', '') : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: `1px solid ${TT.border}`,
        fontFamily: TT_MONO,
        background: TT.bg,
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
        <span
          style={{
            color: TT.green,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          CLAUDE_USAGE
        </span>
        <span style={{ color: TT.textDim, fontSize: 10 }}>
          {APP_VERSION} · single-user{planLabel ? ` · ${planLabel}` : ''}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          fontSize: 10,
          color: TT.textMute,
          flexWrap: 'wrap',
        }}
      >
        <RangePicker value={range} onChange={onRange} />
        <button
          onClick={onOpenPalette}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: `1px solid ${TT.border}`,
            color: TT.textMute,
            padding: '5px 10px',
            fontFamily: TT_MONO,
            fontSize: 10,
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = TT.borderHi;
            e.currentTarget.style.color = TT.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = TT.border;
            e.currentTarget.style.color = TT.textMute;
          }}
        >
          <span>SEARCH</span>
          <span style={{ color: TT.textDim, padding: '1px 5px', border: `1px solid ${TT.border}` }}>
            ⌘K
          </span>
        </button>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          title={bridgeActive ? 'Statusline bridge live' : 'Bridge not connected'}
        >
          <Pulse color={bridgeActive ? TT.green : TT.textDim} /> BRIDGE
        </span>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          title={oauthActive ? 'OAuth fetch enabled' : 'OAuth fetch disabled'}
        >
          <Pulse color={oauthActive ? TT.green : TT.textDim} /> OAUTH
        </span>
        <span style={{ color: TT.textDim }}>{ts}</span>
      </div>
    </div>
  );
}
