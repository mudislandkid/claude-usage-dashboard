import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { useWeekly } from '@/hooks/useWeekly';

export function OauthUsageCard() {
  const { data: settings } = useSettings();
  const { data: weekly } = useWeekly();
  const update = useUpdateSettings();

  const enabled = settings?.oauthUsageEnabled ?? false;
  const credentialsPresent = weekly?.oauth.credentialsPresent ?? false;
  const credentialsSource = weekly?.oauth.credentialsSource ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anthropic OAuth fetch (weekly limits)</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Calls{' '}
          <code className="font-mono">api.anthropic.com/api/oauth/usage</code> every 5 minutes
          to retrieve your weekly all-models and Sonnet-only utilization. The endpoint is
          undocumented but is what the Claude.ai web app uses to populate its{' '}
          <em>Plan usage limits</em> page. Off by default; enabling it lets the dashboard
          pull richer weekly data than the statusline alone provides.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <CredentialStatus
          credentialsPresent={credentialsPresent}
          source={credentialsSource}
        />

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
          <div>
            <div className="text-sm font-medium">Pull weekly limits from Anthropic</div>
            <div className="text-xs text-muted-foreground">
              Reads your existing OAuth token; no new login. Cached locally for 5 min.
            </div>
          </div>
          <Button
            variant={enabled ? 'secondary' : 'default'}
            disabled={update.isPending}
            onClick={() => update.mutate({ oauthUsageEnabled: !enabled })}
          >
            {enabled ? 'Disable' : 'Enable'}
          </Button>
        </div>

        {enabled && weekly?.oauth.lastError && (
          <div className="text-xs text-amber-400">
            Last fetch failed: {weekly.oauth.lastError}
          </div>
        )}
        {enabled && weekly?.oauth.fetchedAt && (
          <div className="text-xs text-muted-foreground">
            Last successful fetch: {new Date(weekly.oauth.fetchedAt).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CredentialStatus({
  credentialsPresent,
  source,
}: {
  credentialsPresent: boolean;
  source: 'file' | 'keychain' | null;
}) {
  if (credentialsPresent) {
    const where =
      source === 'file' ? '~/.claude/.credentials.json' : 'macOS keychain';
    return (
      <div className="flex items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
        <span className="size-2 rounded-full bg-emerald-400" />
        <div className="flex-1">
          <div className="text-sm font-medium text-emerald-300">Credentials found</div>
          <div className="text-xs text-muted-foreground">Loaded from {where}.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
      <span className="size-2 rounded-full bg-amber-400" />
      <div className="flex-1">
        <div className="text-sm font-medium text-amber-300">No credentials found</div>
        <div className="text-xs text-muted-foreground">
          Log into Claude Code first. On macOS the token is stored in the login keychain
          (service <code className="font-mono">Claude Code-credentials</code>) and the
          first read prompts for permission.
        </div>
      </div>
    </div>
  );
}
