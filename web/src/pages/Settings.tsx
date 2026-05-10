import { useEffect, useMemo, useState } from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { usePeakWindow } from '@/hooks/usePeakWindow';
import { PLAN_PRESETS, CUSTOM_PLAN, detectPlan } from '@/lib/plans';
import { formatTokens } from '@/lib/format';
import { StatuslineBridgePanel } from '@/components/term-widgets/SettingsBridge';
import { OauthPanel } from '@/components/term-widgets/SettingsOauth';

export function Settings() {
  const { data } = useSettings();
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

  function autoCalibrate() {
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

  return (
    <div
      style={{
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 1100,
      }}
      className="tt-fade"
    >
      <StatuslineBridgePanel />
      <OauthPanel />

      <TPanel title="5H_WINDOW_LIMIT" sub="// chargeable token cap">
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
          Anthropic doesn't publish exact token caps. Plan presets below are rough estimates;
          auto-calibrate uses your own observed peaks for the most accurate value.
        </p>

        <FieldLabel>PLAN</FieldLabel>
        <select
          value={planId}
          onChange={(e) => handlePlanChange(e.target.value)}
          style={inputStyle}
        >
          {PLAN_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} — {formatTokens(p.windowLimitTokens)}/5h
            </option>
          ))}
          <option value={CUSTOM_PLAN.id}>{CUSTOM_PLAN.label}</option>
        </select>
        <Hint>{planPreset.blurb}</Hint>

        <div style={{ height: 18 }} />
        <FieldLabel>AUTO-CALIBRATE FROM YOUR USAGE</FieldLabel>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={autoCalibrate}
            disabled={!suggestedFromUsage}
            style={{
              background: TT.bgAlt,
              border: `1px solid ${TT.border}`,
              color: suggestedFromUsage ? TT.text : TT.textDim,
              fontFamily: TT_MONO,
              fontSize: 11,
              padding: '8px 14px',
              cursor: suggestedFromUsage ? 'pointer' : 'not-allowed',
              opacity: suggestedFromUsage ? 1 : 0.6,
            }}
          >
            {suggestedFromUsage
              ? `Use my p95 × 1.1 = ${formatTokens(suggestedFromUsage)}`
              : 'Not enough data yet'}
          </button>
          {peak && peak.samples > 0 && (
            <span style={{ fontFamily: TT_MONO, fontSize: 10, color: TT.textMute }}>
              Last 30d: max {formatTokens(peak.max)} · p99 {formatTokens(peak.p99)} · p95{' '}
              {formatTokens(peak.p95)} ({peak.samples} samples)
            </span>
          )}
        </div>

        <div style={{ height: 18 }} />
        <FieldLabel>LIMIT (CHARGEABLE TOKENS / 5H)</FieldLabel>
        <input
          value={windowLimit}
          onChange={(e) => {
            setWindowLimit(e.target.value);
            setPlanId(CUSTOM_PLAN.id);
          }}
          style={inputStyle}
        />
      </TPanel>

      <TPanel title="OTHER_THRESHOLDS">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <FieldLabel>ACTIVE PROJECT THRESHOLD (DAYS)</FieldLabel>
            <input
              value={activeDays}
              onChange={(e) => setActiveDays(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>CACHE SCORE WINDOW (DAYS)</FieldLabel>
            <input
              value={cacheDays}
              onChange={(e) => setCacheDays(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, gap: 10 }}>
          {update.isSuccess && (
            <span
              style={{
                color: TT.green,
                fontFamily: TT_MONO,
                fontSize: 11,
                alignSelf: 'center',
              }}
            >
              ✓ saved
            </span>
          )}
          <button
            onClick={save}
            disabled={update.isPending}
            style={{
              background: TT.green,
              border: `1px solid ${TT.green}`,
              color: '#08090a',
              fontFamily: TT_MONO,
              fontSize: 11,
              fontWeight: 600,
              padding: '8px 22px',
              cursor: 'pointer',
              letterSpacing: '0.08em',
              opacity: update.isPending ? 0.6 : 1,
            }}
          >
            {update.isPending ? 'SAVING…' : 'SAVE_CONFIG'}
          </button>
        </div>
      </TPanel>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: TT.bgAlt,
  border: `1px solid ${TT.border}`,
  padding: '8px 12px',
  color: TT.text,
  fontFamily: TT_MONO,
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: TT_MONO,
        fontSize: 9,
        color: TT.textDim,
        letterSpacing: '0.10em',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: TT_MONO,
        fontSize: 10,
        color: TT.textMute,
        marginTop: 6,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}
