import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWindow, type WindowResponse } from '@/hooks/useWindow';

type Bridge = WindowResponse['bridge'];

const SETTINGS_PATH = '~/.claude/settings.json';
const SIDECAR_PATH = '~/.claude/usage-dashboard.statusline.json';

const SIMPLE_SNIPPET = `{
  "statusLine": {
    "type": "command",
    "command": "tee $HOME/.claude/usage-dashboard.statusline.json > /dev/null"
  }
}`;

const TEE_SNIPPET = `{
  "statusLine": {
    "type": "command",
    "command": "tee $HOME/.claude/usage-dashboard.statusline.json | <YOUR EXISTING STATUSLINE COMMAND HERE>"
  }
}`;

export function StatuslineBridgeCard() {
  const { data } = useWindow();
  const bridge = data?.bridge;
  const [copied, setCopied] = useState<string | null>(null);

  function copy(snippet: string, key: string) {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anthropic bridge</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Pulls the exact 5-hour % directly from Claude Code's statusline JSON, so the gauge
          matches what the Claude app shows. Without this, the dashboard estimates from your
          local JSONL files (which don't include the real cap).
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <BridgeStatus bridge={bridge} />

        <div>
          <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">
            Install (no existing statusline)
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Add this to <code className="font-mono text-foreground">{SETTINGS_PATH}</code>. The
            command silently writes Claude Code's session JSON to{' '}
            <code className="font-mono text-foreground">{SIDECAR_PATH}</code> on every prompt.
          </p>
          <SnippetBlock
            snippet={SIMPLE_SNIPPET}
            copied={copied === 'simple'}
            onCopy={() => copy(SIMPLE_SNIPPET, 'simple')}
          />
        </div>

        <div>
          <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">
            Install (already have a statusline)
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Pipe your stdin through <code className="font-mono text-foreground">tee</code> first
            so both the bridge and your existing command see the JSON.
          </p>
          <SnippetBlock
            snippet={TEE_SNIPPET}
            copied={copied === 'tee'}
            onCopy={() => copy(TEE_SNIPPET, 'tee')}
          />
        </div>

        <div className="text-xs text-muted-foreground">
          The sidecar updates every time you submit a prompt in Claude Code. The bridge appears
          live within seconds. Restart any open Claude Code sessions for the new statusline
          command to take effect.
        </div>
      </CardContent>
    </Card>
  );
}

function BridgeStatus({ bridge }: { bridge: Bridge | undefined }) {
  if (!bridge) return null;

  if (bridge.active) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
        <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
        <div className="flex-1">
          <div className="text-sm font-medium text-emerald-300">Bridge live</div>
          <div className="text-xs text-muted-foreground">
            5h: {bridge.fiveHourPercent?.toFixed(1)}% · 7d:{' '}
            {bridge.sevenDayPercent !== null ? `${bridge.sevenDayPercent.toFixed(1)}%` : '—'} ·
            updated {formatAge(bridge.ageSeconds)} ago
          </div>
        </div>
      </div>
    );
  }
  if (bridge.sidecarPresent) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
        <span className="size-2 rounded-full bg-amber-400" />
        <div className="flex-1">
          <div className="text-sm font-medium text-amber-300">Bridge stale</div>
          <div className="text-xs text-muted-foreground">
            Sidecar exists but its 5h reset has passed. Submit a prompt in Claude Code to refresh.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
      <span className="size-2 rounded-full bg-muted-foreground/50" />
      <div className="flex-1">
        <div className="text-sm font-medium">Bridge not connected</div>
        <div className="text-xs text-muted-foreground">
          Dashboard will estimate the 5h % from local JSONL files. Install the snippet below
          for an exact match with the Claude app.
        </div>
      </div>
    </div>
  );
}

function SnippetBlock({
  snippet,
  copied,
  onCopy,
}: {
  snippet: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="relative">
      <pre className="text-xs font-mono bg-muted/40 border border-border rounded-md p-3 overflow-x-auto whitespace-pre">
        {snippet}
      </pre>
      <Button
        variant="secondary"
        onClick={onCopy}
        className="absolute top-2 right-2 h-7 text-xs px-2"
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}
