import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { useWeekly } from '@/hooks/useWeekly';

export function OauthPanel() {
  const { data: settings } = useSettings();
  const { data: weekly } = useWeekly();
  const update = useUpdateSettings();

  const enabled = settings?.oauthUsageEnabled ?? false;
  const credentialsPresent = weekly?.oauth.credentialsPresent ?? false;
  const credentialsSource = weekly?.oauth.credentialsSource ?? null;

  return (
    <TPanel
      title="ANTHROPIC_OAUTH_FETCH"
      sub="// weekly limits"
      action={enabled ? '● ENABLED' : '○ DISABLED'}
      accent={enabled ? TT.green : TT.amber}
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
        Calls <span style={{ color: TT.green }}>api.anthropic.com/api/oauth/usage</span> every
        5 minutes to retrieve your weekly all-models and Sonnet-only utilization. The endpoint
        is undocumented but is what the Claude.ai web app uses to populate its{' '}
        <em>Plan usage limits</em> page. Off by default; enabling it lets the dashboard pull
        richer weekly data than the statusline alone provides.
      </p>

      <div
        style={{
          padding: 12,
          marginBottom: 14,
          background: credentialsPresent ? TT.greenSoft : 'rgba(251,191,36,0.06)',
          border: `1px solid ${credentialsPresent ? TT.green + '66' : TT.amber + '66'}`,
          fontFamily: TT_MONO,
          fontSize: 12,
          color: credentialsPresent ? TT.green : TT.amber,
        }}
      >
        {credentialsPresent ? '● CREDENTIALS FOUND' : '○ NO CREDENTIALS FOUND'}
        <div style={{ color: TT.textMute, fontSize: 10, marginTop: 4 }}>
          {credentialsPresent
            ? `Loaded from ${credentialsSource === 'file' ? '~/.claude/.credentials.json' : 'macOS keychain'}.`
            : 'Log into Claude Code first. On macOS the token is stored in the login keychain.'}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 12,
          border: `1px solid ${TT.border}`,
        }}
      >
        <div>
          <div style={{ fontFamily: TT_MONO, fontSize: 12, color: TT.text }}>
            Pull weekly limits from Anthropic
          </div>
          <div
            style={{
              fontFamily: TT_MONO,
              fontSize: 10,
              color: TT.textMute,
              marginTop: 4,
            }}
          >
            Reads your existing OAuth token; no new login. Cached locally for 5 min.
          </div>
        </div>
        <button
          disabled={update.isPending}
          onClick={() => update.mutate({ oauthUsageEnabled: !enabled })}
          style={{
            background: enabled ? TT.red + '22' : TT.green + '22',
            border: `1px solid ${enabled ? TT.red : TT.green}`,
            color: enabled ? TT.red : TT.green,
            fontFamily: TT_MONO,
            fontSize: 11,
            padding: '6px 14px',
            cursor: 'pointer',
            letterSpacing: '0.06em',
            opacity: update.isPending ? 0.6 : 1,
          }}
        >
          {enabled ? 'DISABLE' : 'ENABLE'}
        </button>
      </div>

      {weekly?.oauth.lastError && enabled && (
        <div style={{ fontFamily: TT_MONO, fontSize: 11, color: TT.amber, marginTop: 12 }}>
          ⚠ Last fetch failed: {weekly.oauth.lastError}
        </div>
      )}
      {weekly?.oauth.fetchedAt && (
        <div style={{ fontFamily: TT_MONO, fontSize: 10, color: TT.textDim, marginTop: 12 }}>
          Last successful fetch: {new Date(weekly.oauth.fetchedAt).toLocaleString()}
        </div>
      )}
    </TPanel>
  );
}
