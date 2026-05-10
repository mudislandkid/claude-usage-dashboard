import { useNavigate } from 'react-router-dom';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TBadge } from '@/components/terminal/Badge';
import { TBar } from '@/components/terminal/Bar';
import { TCell } from '@/components/terminal/Cell';
import { TTable } from '@/components/terminal/Table';
import { useRangeDays, useRangeLabel } from '@/components/terminal/RangeContext';
import { useTtlLeakage } from '@/hooks/useHeavy';
import { useCacheTtlEfficiency } from '@/hooks/useCacheTtl';
import { formatTokens } from '@/lib/format';
import { fmtUSD } from '@/lib/pricing';

interface Row {
  projectName: string;
  projectPath: string;
  tokens: number;
  pct: number;
}

export function LeakagePanel() {
  const days = useRangeDays();
  const label = useRangeLabel();
  const { data } = useTtlLeakage(days);
  const { data: ttl } = useCacheTtlEfficiency(days);
  const nav = useNavigate();
  if (!data) return <TPanel title="1H_CACHE_LEAKAGE">Loading…</TPanel>;

  const overall = data.overall;
  const pct = (overall.leakageRatio * 100).toFixed(1);
  const apiLeaked = ttl?.cost.totalPremiumUsdSampled ?? 0;

  const rows: Row[] = data.byProject
    .slice(0, 8)
    .map((p) => ({
      projectName: p.projectName,
      projectPath: p.projectPath,
      tokens: p.totalCreation1h,
      pct: Math.round(p.leakageRatio * 100),
    }))
    .filter((r) => r.tokens > 0);

  return (
    <TPanel
      title="1H_CACHE_LEAKAGE"
      sub={`// ${label} · next-turn heuristic`}
      action={`${pct}% LEAKED`}
      accent={TT.red}
    >
      <div
        style={{
          fontFamily: TT_MONO,
          fontSize: 11,
          color: TT.textMute,
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        1h cache writes cost 2× a 5min write. If the next turn lands within 5min, a 5min write
        would have sufficed and the extra cost was wasted. The harness picks the TTL — useful
        as a signal to Anthropic, not a knob you control directly.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          marginBottom: 18,
          padding: 14,
          background: 'rgba(248,113,113,0.05)',
          border: `1px solid rgba(248,113,113,0.20)`,
        }}
      >
        <TCell
          label="OVERALL_LEAK_RATE"
          v={pct + '%'}
          sub={`${formatTokens(overall.totalCreation1h)} 1h tokens written`}
          color={TT.red}
        />
        <TCell
          label="API_$_LEAKED"
          v={fmtUSD(apiLeaked)}
          sub={`if billed per-token · ${label}`}
          color={TT.red}
        />
        <TCell label="YOUR_COST" v="$0.00" sub="covered by subscription" color={TT.greenBright} />
      </div>

      <div
        style={{
          fontFamily: TT_MONO,
          fontSize: 10,
          color: TT.textDim,
          letterSpacing: '0.08em',
          marginBottom: 8,
        }}
      >
        LEAKIEST PROJECTS
      </div>
      <TTable<Row>
        columns={[
          {
            key: 'projectName',
            label: 'PROJECT',
            render: (r) => <span style={{ color: TT.text }}>{r.projectName}</span>,
          },
          {
            key: 'tokens',
            label: 'TOKENS',
            w: '100px',
            align: 'right',
            render: (r) => <span style={{ color: TT.blue }}>{formatTokens(r.tokens)}</span>,
          },
          {
            key: 'pct',
            label: 'LEAK%',
            w: '80px',
            align: 'right',
            render: (r) => (
              <TBadge color={TT.red} fill>
                {r.pct}%
              </TBadge>
            ),
          },
          {
            key: 'bar',
            label: '',
            render: (r) => <TBar pct={r.pct} color={TT.red} h={4} />,
          },
        ]}
        rows={rows}
        onRowClick={(r) => nav(`/projects/${encodeURIComponent(r.projectPath)}`)}
        empty="No 1h-cache leakage detected."
      />
    </TPanel>
  );
}
