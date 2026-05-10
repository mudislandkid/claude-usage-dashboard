import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { useRangeDays, useRangeLabel } from '@/components/terminal/RangeContext';
import { useCostBreakdown, type ModelBucket } from '@/hooks/useCostBreakdown';
import { useCurrentPlan } from '@/hooks/useCurrentPlan';
import { fmtUSD, PLAN_DEFS } from '@/lib/pricing';
import { formatTokens } from '@/lib/format';
import { PricingTooltip } from './PricingTooltip';

const MODEL_COLORS: Record<string, string> = {
  opus: TT.purple,
  sonnet: TT.green,
  haiku: TT.blue,
  other: 'rgba(255,255,255,0.25)',
};
const MODEL_LABELS: Record<string, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  other: 'Other',
};

export function SubscriptionValuePanel() {
  const days = useRangeDays();
  const label = useRangeLabel();
  const { data: cost } = useCostBreakdown(days);
  const plan = useCurrentPlan();
  if (!cost || !plan) return <TPanel title="SUBSCRIPTION_VALUE">Loading…</TPanel>;

  const apiEq = cost.total.totalUsd;
  const monthlyPlan = plan.monthly;
  // Pro-rate plan cost across the active range so the comparison is apples-
  // to-apples ("for these N days you'd have paid $X on the API; your plan
  // share for the same N days is $Y").
  const subForRange = (monthlyPlan * days) / 30;
  const saved = apiEq - subForRange;
  const mult = subForRange > 0 ? apiEq / subForRange : 0;
  const payoffDays = apiEq > 0 ? subForRange / (apiEq / days) : 0;
  const dailyAvg = apiEq / days;

  return (
    <TPanel
      title="SUBSCRIPTION_VALUE"
      sub={`// ${label} · ${plan.name.toLowerCase()} vs api equivalent · input + output + cache writes + cache reads`}
      action={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <PricingTooltip />
          <span>{mult > 0 ? `${mult.toFixed(1)}× LEVERAGE` : 'NO PLAN COST'}</span>
        </span>
      }
      accent={TT.greenBright}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24 }}>
        <div>
          <div
            style={{
              fontFamily: TT_MONO,
              fontSize: 10,
              color: TT.textDim,
              letterSpacing: '0.10em',
              marginBottom: 6,
            }}
          >
            YOU SAVED (LAST {label.toUpperCase()})
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
            <span
              style={{
                fontSize: 48,
                color: saved >= 0 ? TT.greenBright : TT.amber,
                fontWeight: 500,
                fontFamily: TT_MONO,
                lineHeight: 1,
              }}
            >
              {fmtUSD(Math.abs(saved))}
            </span>
            <span style={{ fontSize: 12, color: TT.textMute, fontFamily: TT_MONO }}>
              {saved >= 0 ? 'vs running on the API directly' : 'under-utilising vs API rates'}
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
              padding: 14,
              background: 'rgba(74,222,128,0.04)',
              border: `1px solid ${TT.borderHi}`,
            }}
          >
            <Val
              label="PLAN_SHARE"
              v={fmtUSD(subForRange)}
              sub={
                days === 30
                  ? `${plan.name} · monthly`
                  : `${plan.name} · ${label} of ${fmtUSD(monthlyPlan)}/mo`
              }
              color={TT.text}
            />
            <Val
              label="API_EQUIVALENT"
              v={fmtUSD(apiEq)}
              sub={`${label} · if billed per-token`}
              color={TT.amber}
            />
            <Val
              label="EFFECTIVE_RATE"
              v={mult > 0 ? mult.toFixed(1) + '×' : '—'}
              sub="cents-on-the-dollar"
              color={TT.greenBright}
            />
          </div>
          {monthlyPlan > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 14px',
                background: TT.bgAlt,
                border: `1px solid ${TT.border}`,
                fontFamily: TT_MONO,
                fontSize: 11,
                color: TT.textMute,
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: TT.greenBright }}>▸</span> At this burn the monthly
              subscription ({fmtUSD(monthlyPlan)}) pays itself off in{' '}
              <span style={{ color: TT.greenBright }}>~{payoffDays.toFixed(1)} days</span> of
              API-equivalent usage.
              <br />
              <span style={{ color: TT.green }}>▸</span> Daily API-equiv avg over {label}:{' '}
              <span style={{ color: TT.green }}>{fmtUSD(dailyAvg)}</span>
            </div>
          )}
        </div>

        <div>
          <div
            style={{
              fontFamily: TT_MONO,
              fontSize: 10,
              color: TT.textDim,
              letterSpacing: '0.10em',
              marginBottom: 10,
            }}
          >
            PLAN COMPARISON — {label.toUpperCase()} ACTUAL USAGE
          </div>
          <PlanCompare apiEq={apiEq} currentPlan={plan.id} days={days} />
        </div>
      </div>

      <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px dashed ${TT.border}` }}>
        <div
          style={{
            fontFamily: TT_MONO,
            fontSize: 10,
            color: TT.textDim,
            letterSpacing: '0.10em',
            marginBottom: 10,
          }}
        >
          API-EQUIV COST BY MODEL — {label.toUpperCase()}
        </div>
        <ModelCostBars byModel={cost.byModel} />
      </div>

      <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px dashed ${TT.border}` }}>
        <div
          style={{
            fontFamily: TT_MONO,
            fontSize: 10,
            color: TT.textDim,
            letterSpacing: '0.10em',
            marginBottom: 10,
          }}
        >
          API-EQUIV COST BY BUCKET — {label.toUpperCase()}
        </div>
        <BucketBreakdown total={cost.total} />
      </div>
    </TPanel>
  );
}

function Val({ label, v, sub, color }: { label: string; v: string; sub: string; color: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: TT_MONO,
          fontSize: 9,
          color: TT.textDim,
          letterSpacing: '0.10em',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: TT_MONO, fontSize: 22, color, fontWeight: 500, lineHeight: 1 }}>{v}</div>
      <div style={{ fontFamily: TT_MONO, fontSize: 10, color: TT.textMute, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function PlanCompare({
  apiEq,
  currentPlan,
  days,
}: {
  apiEq: number;
  currentPlan: string;
  days: number;
}) {
  // Pro-rate plan monthly cost to the selected range so the bars compare like
  // for like against the API equivalent.
  const factor = days / 30;
  const rows = [
    {
      id: 'pro',
      name: PLAN_DEFS.pro.name,
      cost: PLAN_DEFS.pro.monthly * factor,
      note: '~1.1M/5h',
      color: TT.textMute,
    },
    {
      id: 'max5',
      name: PLAN_DEFS.max5.name,
      cost: PLAN_DEFS.max5.monthly * factor,
      note: '~5.5M/5h',
      color: TT.blue,
    },
    {
      id: 'max20',
      name: PLAN_DEFS.max20.name,
      cost: PLAN_DEFS.max20.monthly * factor,
      note: '~21.5M/5h',
      color: TT.greenBright,
    },
    {
      id: 'api',
      name: 'API',
      cost: apiEq,
      note: 'pay-per-token',
      color: TT.amber,
      isApi: true as const,
    },
  ];
  const max = Math.max(...rows.map((r) => r.cost), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => {
        const current = currentPlan === r.id;
        const widthPct = (r.cost / max) * 100;
        return (
          <div key={r.name} style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: TT_MONO,
                fontSize: 11,
                marginBottom: 4,
              }}
            >
              <span style={{ color: current ? TT.greenBright : r.color }}>
                {current ? '▶ ' : ''}
                {r.name}
                <span style={{ color: TT.textDim, fontSize: 10, marginLeft: 8 }}>
                  {r.note}
                </span>
              </span>
              <span style={{ color: r.color }}>
                {fmtUSD(r.cost)}
                {'isApi' in r ? '' : days === 30 ? '/mo' : ''}
              </span>
            </div>
            <div
              style={{
                position: 'relative',
                height: 10,
                background: 'rgba(120,200,140,0.05)',
                border: current ? `1px solid ${TT.green}` : `1px solid ${TT.border}`,
              }}
            >
              <div
                style={{
                  width: widthPct + '%',
                  height: '100%',
                  background: r.color,
                  opacity: current ? 1 : 0.7,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModelCostBars({ byModel }: { byModel: ModelBucket[] }) {
  const ordered = [...byModel].sort((a, b) => b.totalUsd - a.totalUsd);
  const total = ordered.reduce((a, b) => a + b.totalUsd, 0) || 1;

  return (
    <div>
      <div style={{ display: 'flex', height: 22, marginBottom: 12 }}>
        {ordered.map((m, i) => {
          const color = MODEL_COLORS[m.family] ?? TT.textMute;
          return (
            <div
              key={m.family}
              style={{
                flex: Math.max(0.0001, m.totalUsd),
                background: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: TT_MONO,
                fontSize: 10,
                color: '#08090a',
                borderRight: i < ordered.length - 1 ? '1px solid #08090a' : 'none',
                minWidth: m.totalUsd > 0 ? 36 : 0,
              }}
            >
              {m.totalUsd / total > 0.04
                ? `${MODEL_LABELS[m.family]} · ${((m.totalUsd / total) * 100).toFixed(0)}%`
                : ''}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {ordered.map((m) => {
          const color = MODEL_COLORS[m.family] ?? TT.textMute;
          return (
            <div
              key={m.family}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '8px 12px',
                border: `1px solid ${TT.border}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: TT_MONO,
                  fontSize: 10,
                  color: TT.textMute,
                }}
              >
                <span style={{ width: 8, height: 8, background: color }} />
                {MODEL_LABELS[m.family]}
              </div>
              <div style={{ fontFamily: TT_MONO, fontSize: 16, color, fontWeight: 500 }}>
                {fmtUSD(m.totalUsd)}
              </div>
              <div style={{ fontFamily: TT_MONO, fontSize: 9, color: TT.textDim }}>
                {formatTokens(
                  m.inputTokens +
                    m.outputTokens +
                    m.cacheReadTokens +
                    m.cacheCreation5mTokens +
                    m.cacheCreation1hTokens,
                )}{' '}
                tokens
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface BucketTotal {
  inputUsd: number;
  outputUsd: number;
  cacheReadUsd: number;
  cacheCreation5mUsd: number;
  cacheCreation1hUsd: number;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
}

function BucketBreakdown({ total }: { total: BucketTotal }) {
  const buckets = [
    { key: 'input', label: 'INPUT', usd: total.inputUsd, tok: total.inputTokens, color: TT.blue },
    { key: 'output', label: 'OUTPUT', usd: total.outputUsd, tok: total.outputTokens, color: TT.amber },
    {
      key: 'cwrite5m',
      label: 'CACHE WRITE 5M',
      usd: total.cacheCreation5mUsd,
      tok: total.cacheCreation5mTokens,
      color: TT.green,
    },
    {
      key: 'cwrite1h',
      label: 'CACHE WRITE 1H',
      usd: total.cacheCreation1hUsd,
      tok: total.cacheCreation1hTokens,
      color: TT.purple,
    },
    {
      key: 'cread',
      label: 'CACHE READ',
      usd: total.cacheReadUsd,
      tok: total.cacheReadTokens,
      color: TT.cyan,
    },
  ];
  const tot = total.totalUsd || 1;
  return (
    <div>
      <div style={{ display: 'flex', height: 18, marginBottom: 12 }}>
        {buckets.map((b, i) => (
          <div
            key={b.key}
            style={{
              flex: Math.max(0.0001, b.usd),
              background: b.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: TT_MONO,
              fontSize: 9,
              color: '#08090a',
              borderRight: i < buckets.length - 1 ? '1px solid #08090a' : 'none',
              minWidth: b.usd > 0 ? 24 : 0,
            }}
          >
            {b.usd / tot > 0.05 ? `${((b.usd / tot) * 100).toFixed(0)}%` : ''}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {buckets.map((b) => (
          <div
            key={b.key}
            style={{
              padding: '8px 10px',
              border: `1px solid ${TT.border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                fontFamily: TT_MONO,
                fontSize: 9,
                color: TT.textDim,
                letterSpacing: '0.08em',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ width: 8, height: 8, background: b.color }} />
              {b.label}
            </div>
            <div style={{ fontFamily: TT_MONO, fontSize: 14, color: b.color, fontWeight: 500 }}>
              {fmtUSD(b.usd)}
            </div>
            <div style={{ fontFamily: TT_MONO, fontSize: 9, color: TT.textDim }}>
              {formatTokens(b.tok)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
