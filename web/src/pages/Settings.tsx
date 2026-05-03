import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';

export function Settings() {
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const [windowLimit, setWindowLimit] = useState('');
  const [activeDays, setActiveDays] = useState('');
  const [cacheDays, setCacheDays] = useState('');

  useEffect(() => {
    if (data) {
      setWindowLimit(String(data.windowLimitTokens));
      setActiveDays(String(data.activeWithinDays));
      setCacheDays(String(data.cacheScoreWindowDays));
    }
  }, [data]);

  if (isLoading || !data) return <Skeleton className="h-72" />;

  function save() {
    update.mutate({
      windowLimitTokens: Number(windowLimit),
      activeWithinDays: Number(activeDays),
      cacheScoreWindowDays: Number(cacheDays),
    });
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
      <Card>
        <CardHeader>
          <CardTitle>Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="5h window limit (chargeable tokens)">
            <input
              value={windowLimit}
              onChange={(e) => setWindowLimit(e.target.value)}
              className="bg-input rounded-md px-3 py-2 text-sm w-full"
            />
          </Field>
          <Field label="Active project threshold (days)">
            <input
              value={activeDays}
              onChange={(e) => setActiveDays(e.target.value)}
              className="bg-input rounded-md px-3 py-2 text-sm w-full"
            />
          </Field>
          <Field label="Cache score window (days)">
            <input
              value={cacheDays}
              onChange={(e) => setCacheDays(e.target.value)}
              className="bg-input rounded-md px-3 py-2 text-sm w-full"
            />
          </Field>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase text-muted-foreground tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
