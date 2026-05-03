import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { usePeakWindow } from '@/hooks/usePeakWindow';
import { PLAN_PRESETS, CUSTOM_PLAN, detectPlan } from '@/lib/plans';
import { formatTokens } from '@/lib/format';

export function Settings() {
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const { data: peak } = usePeakWindow(30);

  const [planId, setPlanId] = useState(CUSTOM_PLAN.id);
  const [windowLimit, setWindowLimit] = useState('');
  const [activeDays, setActiveDays] = useState('');
  const [cacheDays, setCacheDays] = useState('');

  useEffect(() => {
    if (data) {
      setPlanId(detectPlan(data.windowLimitTokens));
      setWindowLimit(String(data.windowLimitTokens));
      setActiveDays(String(data.activeWithinDays));
      setCacheDays(String(data.cacheScoreWindowDays));
    }
  }, [data]);

  const planPreset = useMemo(
    () => PLAN_PRESETS.find((p) => p.id === planId) ?? CUSTOM_PLAN,
    [planId],
  );

  const suggestedFromUsage = useMemo(() => {
    if (!peak || peak.samples === 0) return null;
    return Math.round(peak.p95 * 1.1);
  }, [peak]);

  function handlePlanChange(id: string) {
    setPlanId(id);
    const preset = PLAN_PRESETS.find((p) => p.id === id);
    if (preset) setWindowLimit(String(preset.windowLimitTokens));
  }

  function applyAutoCalibrate() {
    if (suggestedFromUsage) {
      setWindowLimit(String(suggestedFromUsage));
      setPlanId(CUSTOM_PLAN.id);
    }
  }

  function save() {
    update.mutate({
      windowLimitTokens: Number(windowLimit),
      activeWithinDays: Number(activeDays),
      cacheScoreWindowDays: Number(cacheDays),
    });
  }

  if (isLoading || !data) return <Skeleton className="h-72" />;

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle>5-hour window limit</CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Anthropic doesn't publish exact token caps. Plan presets below are rough estimates;
            auto-calibrate uses your own observed peaks for the most accurate value.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Plan">
            <select
              value={planId}
              onChange={(e) => handlePlanChange(e.target.value)}
              className="bg-input rounded-md px-3 py-2 text-sm w-full border border-border"
            >
              {PLAN_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {formatTokens(p.windowLimitTokens)}/5h
                </option>
              ))}
              <option value={CUSTOM_PLAN.id}>{CUSTOM_PLAN.label}</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">{planPreset.blurb}</p>
          </Field>

          <Field label="Auto-calibrate from your usage">
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={applyAutoCalibrate}
                disabled={!suggestedFromUsage}
              >
                {suggestedFromUsage
                  ? `Use my p95 × 1.1 = ${formatTokens(suggestedFromUsage)}`
                  : 'Not enough data yet'}
              </Button>
              {peak && peak.samples > 0 && (
                <span className="text-xs text-muted-foreground">
                  Last 30d: max {formatTokens(peak.max)} • p99 {formatTokens(peak.p99)} • p95{' '}
                  {formatTokens(peak.p95)} ({peak.samples} samples)
                </span>
              )}
            </div>
          </Field>

          <Field label="Limit (chargeable tokens / 5h)">
            <input
              value={windowLimit}
              onChange={(e) => {
                setWindowLimit(e.target.value);
                setPlanId(CUSTOM_PLAN.id);
              }}
              className="bg-input rounded-md px-3 py-2 text-sm w-full font-mono"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Other thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
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
