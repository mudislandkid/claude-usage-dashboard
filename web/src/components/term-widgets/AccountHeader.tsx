import { TT, TT_MONO } from '@/components/terminal/tokens';
import { useWeekly } from '@/hooks/useWeekly';

/**
 * Slim header bar showing which Claude account the dashboard is currently
 * reading. Identity comes from ~/.claude.json's oauthAccount (via /api/weekly),
 * which is rewritten the instant the user switches accounts — so this always
 * reflects "whose numbers am I looking at right now".
 */
export function AccountHeader() {
  const { data } = useWeekly();
  const account = data?.account ?? null;
  const switching = data?.switching ?? false;
  const oauthLive = Boolean(data?.oauth.enabled && data?.oauth.credentialsPresent);
  const sourceTag = oauthLive ? 'OAUTH' : 'STATUSLINE';

  const email = account?.email ?? null;
  const org = account?.organizationName ?? null;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        background: TT.panel,
        border: `1px solid ${TT.border}`,
        borderLeft: `2px solid ${switching ? TT.amber : TT.green}`,
        fontFamily: TT_MONO,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
        <span
          style={{
            color: TT.green,
            fontSize: 11,
            letterSpacing: '0.10em',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          ▶ ACCOUNT
        </span>

        {switching ? (
          <span style={{ color: TT.amber, fontSize: 12 }}>▸ switching account…</span>
        ) : email ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span
              style={{
                color: TT.greenBright,
                fontSize: 12,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {email}
            </span>
            {org && (
              <span
                style={{
                  color: TT.textMute,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                · {org}
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: TT.textDim, fontSize: 12 }}>no account detected</span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
          marginLeft: 12,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: switching ? TT.amber : TT.green,
            display: 'inline-block',
          }}
        />
        <span style={{ color: TT.textMute, fontSize: 10, letterSpacing: '0.06em' }}>
          {sourceTag}
        </span>
      </div>
    </div>
  );
}
