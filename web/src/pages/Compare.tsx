import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { useProjects } from '@/hooks/useProjects';
import { useProject } from '@/hooks/useProject';
import { useCostBreakdown } from '@/hooks/useCostBreakdown';
import { useCurrentPlan } from '@/hooks/useCurrentPlan';
import { formatTokens, formatRelative, formatPercent } from '@/lib/format';
import { fmtUSD } from '@/lib/pricing';

export function Compare() {
  const [params, setParams] = useSearchParams();
  const initial = useMemo(() => params.get('p')?.split(',').filter(Boolean) ?? [], [params]);
  const [selected, setSelected] = useState<string[]>(initial);
  const [query, setQuery] = useState('');
  const { data: projects } = useProjects();
  const { data: cost } = useCostBreakdown(30);
  const plan = useCurrentPlan();

  useEffect(() => {
    setParams(selected.length ? { p: selected.join(',') } : {});
  }, [selected, setParams]);

  const costByPath = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of cost?.byProject ?? []) {
      m.set(p.projectPath, p.totalUsd);
    }
    return m;
  }, [cost]);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? projects.projects.filter(
          (p) =>
            p.projectName.toLowerCase().includes(q) ||
            p.projectPath.toLowerCase().includes(q),
        )
      : projects.projects;
    return list.slice(0, 30);
  }, [projects, query]);

  function toggle(path: string) {
    setSelected((s) =>
      s.includes(path) ? s.filter((p) => p !== path) : s.length >= 4 ? s : [...s, path],
    );
  }

  const totalApi = selected.reduce((a, p) => a + (costByPath.get(p) ?? 0), 0);
  const planMonthly = plan?.monthly ?? 0;
  const totalSaved = totalApi - planMonthly;

  return (
    <div
      style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
      className="tt-fade"
    >
      <TPanel title="COMPARE_PROJECTS" sub="// pick up to 4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search projects…"
          style={{
            width: '100%',
            maxWidth: 360,
            background: TT.bgAlt,
            border: `1px solid ${TT.border}`,
            padding: '8px 12px',
            color: TT.text,
            fontFamily: TT_MONO,
            fontSize: 12,
            outline: 'none',
            marginBottom: 14,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = TT.borderHi)}
          onBlur={(e) => (e.currentTarget.style.borderColor = TT.border)}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {filtered.map((p) => {
            const sel = selected.includes(p.projectPath);
            const disabled = !sel && selected.length >= 4;
            return (
              <button
                key={p.projectPath}
                onClick={() => toggle(p.projectPath)}
                disabled={disabled}
                style={{
                  background: sel ? TT.greenSoft : 'transparent',
                  border: `1px solid ${sel ? TT.green : TT.border}`,
                  color: sel ? TT.green : disabled ? TT.textDim : TT.textMute,
                  fontFamily: TT_MONO,
                  fontSize: 11,
                  padding: '5px 10px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                  transition: 'all 100ms',
                }}
              >
                {sel && '✓ '}
                {p.projectName}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => setSelected([])}
            style={{
              background: 'transparent',
              border: `1px solid ${TT.border}`,
              color: TT.textMute,
              fontFamily: TT_MONO,
              fontSize: 11,
              padding: '6px 12px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            CLEAR
          </button>
          <span style={{ fontFamily: TT_MONO, fontSize: 11, color: TT.textDim }}>
            {selected.length}/4 selected
          </span>
        </div>
      </TPanel>

      {selected.length > 0 && plan && (
        <TPanel
          title="COST_ROLLUP"
          sub={`// across ${selected.length} project${selected.length > 1 ? 's' : ''} · plan: ${plan.name}`}
          action={
            totalSaved > 0
              ? `SAVED ${fmtUSD(totalSaved)}`
              : planMonthly > 0
                ? 'UNDER PLAN'
                : 'NO PLAN COST'
          }
          accent={totalSaved > 0 ? TT.greenBright : TT.blue}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Val label="API_EQUIVALENT" v={fmtUSD(totalApi)} sub="30d · selected projects" color={TT.amber} />
            <Val label="YOUR_PLAN" v={fmtUSD(planMonthly)} sub={`${plan.name} · monthly`} color={TT.text} />
            <Val
              label={totalSaved > 0 ? 'SAVED' : 'HEADROOM'}
              v={fmtUSD(Math.abs(totalSaved))}
              sub={totalSaved > 0 ? 'vs api per-token' : 'plan covers this'}
              color={totalSaved > 0 ? TT.greenBright : TT.green}
            />
            <Val
              label="LEVERAGE"
              v={planMonthly > 0 ? (totalApi / planMonthly).toFixed(1) + '×' : '—'}
              sub="effective rate"
              color={TT.greenBright}
            />
          </div>
          <div
            style={{
              marginTop: 14,
              padding: '10px 14px',
              background: TT.bgAlt,
              border: `1px solid ${TT.border}`,
              fontFamily: TT_MONO,
              fontSize: 11,
              color: TT.textMute,
            }}
          >
            <span style={{ color: TT.greenBright }}>▸</span> Change plan in{' '}
            <span style={{ color: TT.green }}>Settings → 5h window limit</span> to recompute.
            Currently: <span style={{ color: TT.greenBright }}>{plan.name}</span>.
          </div>
        </TPanel>
      )}

      {selected.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${selected.length}, minmax(0, 1fr))`,
            gap: 16,
          }}
        >
          {selected.map((path) => (
            <CompareCard
              key={path}
              path={path}
              totalApi={totalApi}
              planMonthly={planMonthly}
              apiCost={costByPath.get(path) ?? 0}
            />
          ))}
        </div>
      )}

      {selected.length === 0 && (
        <div style={{ fontFamily: TT_MONO, fontSize: 12, color: TT.textMute }}>
          Select 2–4 projects to compare.
        </div>
      )}
    </div>
  );
}

interface CompareCardProps {
  path: string;
  totalApi: number;
  planMonthly: number;
  apiCost: number;
}

function CompareCard({ path, totalApi, planMonthly, apiCost }: CompareCardProps) {
  const { data } = useProject(path, 30);
  const header = data?.header;
  const name = header?.projectName ?? path;
  const short = path.length > 30 ? path.slice(0, 28) + '…' : path;

  if (!data || !header) {
    return (
      <TPanel title={name.toUpperCase()} sub={short}>
        <div style={{ color: TT.textMute, fontSize: 11 }}>Loading…</div>
      </TPanel>
    );
  }

  const share = totalApi ? apiCost / totalApi : 0;
  const planShare = share * planMonthly;
  const saved = apiCost - planShare;
  const cacheScore = data.cache ? data.cache.effectiveness * 100 : 0;
  const ttlPct = data.cacheTtl ? data.cacheTtl.ratio1h * 100 : 0;
  const mix = data.modelMix;
  const mixTotal = mix ? mix.opus + mix.sonnet + mix.haiku + mix.other : 0;

  return (
    <TPanel title={name.toUpperCase()} sub={short}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: TT_MONO, fontSize: 12 }}>
        <Row label="LAST_30D" value={formatTokens(header.totalTokens30d)} color={TT.green} />
        <Row label="LAST_7D" value={formatTokens(header.totalTokens7d)} color={TT.green} />
        <Row label="SESSIONS" value={String(header.sessionCount)} color={TT.blue} />
        <Row label="TURNS" value={header.turnCount.toLocaleString()} color={TT.blue} />
        <Row label="LAST_ACT" value={formatRelative(header.lastActivity)} color={TT.text} />
        <Row
          label="CACHE_SCORE"
          value={data.cache ? formatPercent(data.cache.effectiveness, 1) : '—'}
          color={cacheScore >= 95 ? TT.green : cacheScore >= 70 ? TT.amber : TT.red}
        />
        <Row
          label="SUBAGENT_X"
          value={data.subagent ? data.subagent.multiplier.toFixed(2) + '×' : '—'}
          color={TT.purple}
        />
        <Row
          label="1H_CACHE_TTL"
          value={data.cacheTtl ? formatPercent(data.cacheTtl.ratio1h, 0) : '—'}
          color={ttlPct > 70 ? TT.amber : TT.green}
        />
        <Row
          label="GIT_COMMITS"
          value={data.git?.isRepo ? String(data.git.commitCount) : 'n/a'}
          color={TT.text}
        />
      </div>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${TT.border}` }}>
        <div
          style={{
            fontFamily: TT_MONO,
            fontSize: 9,
            color: TT.textDim,
            letterSpacing: '0.10em',
            marginBottom: 8,
          }}
        >
          API EQUIVALENT · 30D
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: TT_MONO, fontSize: 12 }}>
          <Row label="API_COST" value={fmtUSD(apiCost)} color={TT.amber} />
          <Row label="PLAN_SHARE" value={fmtUSD(planShare)} color={TT.text} />
          <Row label="SAVED" value={fmtUSD(Math.max(0, saved))} color={TT.greenBright} />
        </div>
      </div>

      {mix && mixTotal > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${TT.border}` }}>
          <div
            style={{
              fontFamily: TT_MONO,
              fontSize: 9,
              color: TT.textDim,
              letterSpacing: '0.10em',
              marginBottom: 6,
            }}
          >
            MODEL MIX
          </div>
          <div style={{ display: 'flex', height: 10, width: '100%' }}>
            <div style={{ flex: mix.opus, background: TT.purple }} />
            <div style={{ flex: mix.sonnet, background: TT.green }} />
            <div style={{ flex: mix.haiku, background: TT.blue }} />
            <div style={{ flex: mix.other, background: 'rgba(255,255,255,0.18)' }} />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 6,
              fontFamily: TT_MONO,
              fontSize: 9,
              color: TT.textMute,
            }}
          >
            <span style={{ color: TT.purple }}>OPUS {Math.round((mix.opus / mixTotal) * 100)}%</span>
            <span style={{ color: TT.green }}>SONNET {Math.round((mix.sonnet / mixTotal) * 100)}%</span>
          </div>
        </div>
      )}
    </TPanel>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 0',
        borderBottom: `1px dashed ${TT.border}`,
      }}
    >
      <span style={{ color: TT.textDim, fontSize: 10, letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

function Val({
  label,
  v,
  sub,
  color,
}: {
  label: string;
  v: string;
  sub: string;
  color: string;
}) {
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
