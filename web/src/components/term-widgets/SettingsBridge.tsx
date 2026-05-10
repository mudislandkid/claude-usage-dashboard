import { useState } from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TickerNum } from '@/components/terminal/Ticker';
import { useWindow } from '@/hooks/useWindow';

const SIMPLE = `{
  "statusLine": {
    "type": "command",
    "command": "tee $HOME/.claude/usage-dashboard.statusline.json > /dev/null"
  }
}`;

const TEE = `{
  "statusLine": {
    "type": "command",
    "command": "tee $HOME/.claude/usage-dashboard.statusline.json | <YOUR EXISTING STATUSLINE>"
  }
}`;

export function StatuslineBridgePanel() {
  const { data } = useWindow();
  const bridge = data?.bridge;
  const [copied, setCopied] = useState<string | null>(null);

  function copy(key: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const live = bridge?.active ?? false;
  const stale = !live && (bridge?.sidecarPresent ?? false);

  return (
    <TPanel
      title="ANTHROPIC_BRIDGE"
      sub="// statusline JSON sidecar"
      action={live ? '● LIVE' : stale ? '○ STALE' : '○ OFFLINE'}
      accent={live ? TT.green : stale ? TT.amber : TT.textMute}
    >
      <p
        style={{
          fontFamily: TT_MONO,
          fontSize: 11,
          color: TT.textMute,
          marginTop: 0,
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        Pulls the exact 5-hour % directly from Claude Code's statusline JSON, so the gauge
        matches what the Claude app shows. Without this, the dashboard estimates from your local
        JSONL files (which don't include the real cap).
      </p>

      {live && bridge && (
        <div
          style={{
            padding: 12,
            background: TT.greenSoft,
            border: `1px solid ${TT.green}66`,
            marginBottom: 18,
            fontFamily: TT_MONO,
            fontSize: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ color: TT.green, marginBottom: 4 }}>● BRIDGE LIVE</div>
            <div style={{ color: TT.textMute, fontSize: 10 }}>
              5h: {bridge.fiveHourPercent?.toFixed(1)}% · 7d:{' '}
              {bridge.sevenDayPercent !== null ? `${bridge.sevenDayPercent.toFixed(1)}%` : '—'} ·
              updated {fmtAge(bridge.ageSeconds)} ago
            </div>
          </div>
          <TickerNum
            value={bridge.fiveHourPercent ?? 0}
            fmt={(v) => v.toFixed(1) + '%'}
            color={TT.green}
            style={{ fontSize: 20, fontFamily: TT_MONO }}
          />
        </div>
      )}

      {stale && (
        <div
          style={{
            padding: 12,
            background: 'rgba(251,191,36,0.06)',
            border: `1px solid ${TT.amber}66`,
            marginBottom: 18,
            fontFamily: TT_MONO,
            fontSize: 11,
            color: TT.amber,
          }}
        >
          ○ BRIDGE STALE — sidecar exists but its 5h reset has passed. Submit a prompt in Claude
          Code to refresh.
        </div>
      )}

      <ConfigBlock
        label="INSTALL (NO EXISTING STATUSLINE)"
        desc={
          <>
            Add this to <span style={{ color: TT.green }}>~/.claude/settings.json</span>. The
            command silently writes Claude Code's session JSON to{' '}
            <span style={{ color: TT.green }}>~/.claude/usage-dashboard.statusline.json</span> on
            every prompt.
          </>
        }
        code={SIMPLE}
        copied={copied === 'a'}
        onCopy={() => copy('a', SIMPLE)}
      />
      <div style={{ height: 14 }} />
      <ConfigBlock
        label="INSTALL (ALREADY HAVE A STATUSLINE)"
        desc={
          <>
            Pipe your stdin through <span style={{ color: TT.green }}>tee</span> first so both
            the bridge and your existing command see the JSON.
          </>
        }
        code={TEE}
        copied={copied === 'b'}
        onCopy={() => copy('b', TEE)}
      />
    </TPanel>
  );
}

function fmtAge(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

interface BlockProps {
  label: string;
  desc: React.ReactNode;
  code: string;
  copied: boolean;
  onCopy: () => void;
}

function ConfigBlock({ label, desc, code, copied, onCopy }: BlockProps) {
  return (
    <div>
      <div
        style={{
          fontFamily: TT_MONO,
          fontSize: 9,
          color: TT.textDim,
          letterSpacing: '0.10em',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: TT_MONO,
          fontSize: 11,
          color: TT.textMute,
          marginBottom: 8,
          lineHeight: 1.5,
        }}
      >
        {desc}
      </div>
      <div style={{ position: 'relative', border: `1px solid ${TT.border}`, background: TT.bgAlt }}>
        <pre
          style={{
            margin: 0,
            padding: '12px 14px',
            fontFamily: TT_MONO,
            fontSize: 11,
            color: TT.green,
            overflow: 'auto',
          }}
        >
          {code}
        </pre>
        <button
          onClick={onCopy}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: copied ? TT.green : TT.bg,
            border: `1px solid ${copied ? TT.green : TT.border}`,
            color: copied ? '#08090a' : TT.textMute,
            fontFamily: TT_MONO,
            fontSize: 10,
            padding: '4px 10px',
            cursor: 'pointer',
            letterSpacing: '0.06em',
            transition: 'all 120ms',
          }}
        >
          {copied ? '✓ COPIED' : 'COPY'}
        </button>
      </div>
    </div>
  );
}
