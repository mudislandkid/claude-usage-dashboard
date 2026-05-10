import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TBadge } from '@/components/terminal/Badge';
import { TTable, type TColumn } from '@/components/terminal/Table';
import { SegBtn } from '@/components/terminal/SegBtn';
import { useProjects, type ProjectRow } from '@/hooks/useProjects';
import { useCostBreakdown } from '@/hooks/useCostBreakdown';
import { formatTokens, formatRelative } from '@/lib/format';
import { fmtUSDCompact } from '@/lib/pricing';

const STATUS = ['all', 'active', 'idle'] as const;
const SORT = ['recent', 'tokens', 'sessions'] as const;

type StatusOpt = (typeof STATUS)[number];
type SortOpt = (typeof SORT)[number];

interface Row extends ProjectRow {
  idx: string;
  apiCost: number;
}

export function Projects() {
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<StatusOpt>('all');
  const [sort, setSort] = useState<SortOpt>('recent');
  const { data } = useProjects();
  const { data: cost } = useCostBreakdown(30);
  const nav = useNavigate();

  const costByPath = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of cost?.byProject ?? []) {
      m.set(p.projectPath, p.totalUsd);
    }
    return m;
  }, [cost]);

  const filtered = useMemo<Row[]>(() => {
    if (!data) return [];
    let r = data.projects;
    if (status !== 'all') r = r.filter((p) => (status === 'active' ? p.isActive : !p.isActive));
    if (filter) {
      const q = filter.toLowerCase();
      r = r.filter(
        (p) =>
          p.projectName.toLowerCase().includes(q) ||
          p.projectPath.toLowerCase().includes(q),
      );
    }
    if (sort === 'tokens') r = [...r].sort((a, b) => b.totalTokens - a.totalTokens);
    if (sort === 'sessions') r = [...r].sort((a, b) => b.sessionCount - a.sessionCount);
    if (sort === 'recent')
      r = [...r].sort(
        (a, b) => new Date(b.lastTouched).getTime() - new Date(a.lastTouched).getTime(),
      );
    return r.map((p, i) => ({
      ...p,
      idx: String(i + 1).padStart(2, '0'),
      apiCost: costByPath.get(p.projectPath) ?? 0,
    }));
  }, [data, filter, status, sort, costByPath]);

  const totalTokens = filtered.reduce((a, b) => a + b.totalTokens, 0);

  const columns: TColumn<Row>[] = [
    { key: 'idx', label: '#', w: '34px', render: (r) => <span style={{ color: TT.textDim }}>{r.idx}</span> },
    {
      key: 'name',
      label: 'PROJECT',
      w: '260px',
      render: (r) => <span style={{ color: TT.text }}>{r.projectName}</span>,
    },
    {
      key: 'path',
      label: 'PATH',
      render: (r) => (
        <span style={{ color: TT.textMute, fontSize: 10 }}>{r.projectPath}</span>
      ),
    },
    {
      key: 'lastTouched',
      label: 'LAST',
      w: '90px',
      align: 'right',
      render: (r) => <span style={{ color: TT.textMute }}>{formatRelative(r.lastTouched)}</span>,
    },
    {
      key: 'sessions',
      label: 'SESS',
      w: '60px',
      align: 'right',
      render: (r) => <span style={{ color: TT.blue }}>{r.sessionCount}</span>,
    },
    {
      key: 'tokens',
      label: 'TOKENS',
      w: '90px',
      align: 'right',
      render: (r) => <span style={{ color: TT.green }}>{formatTokens(r.totalTokens)}</span>,
    },
    {
      key: 'cost',
      label: 'API $',
      w: '90px',
      align: 'right',
      render: (r) => (
        <span style={{ color: r.apiCost > 100 ? TT.amber : TT.textMute }}>
          {r.apiCost < 0.01 ? '<$0.01' : fmtUSDCompact(r.apiCost)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'STATUS',
      w: '70px',
      align: 'right',
      render: (r) => (
        <TBadge color={r.isActive ? TT.green : TT.textMute}>
          {r.isActive ? 'active' : 'idle'}
        </TBadge>
      ),
    },
  ];

  return (
    <div
      style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
      className="tt-fade"
    >
      <TPanel
        title="PROJECTS"
        sub={`// ${filtered.length} of ${data?.projects.length ?? 0}`}
        action={`${formatTokens(totalTokens)} TOTAL`}
      >
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 18,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: TT.textDim,
                fontFamily: TT_MONO,
                fontSize: 11,
              }}
            >
              $
            </span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter projects…"
              style={{
                width: '100%',
                background: TT.bgAlt,
                border: `1px solid ${TT.border}`,
                padding: '8px 12px 8px 28px',
                color: TT.text,
                fontFamily: TT_MONO,
                fontSize: 12,
                outline: 'none',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = TT.borderHi)}
              onBlur={(e) => (e.currentTarget.style.borderColor = TT.border)}
            />
          </div>
          <SegBtn options={STATUS} value={status} onChange={setStatus} />
          <SegBtn options={SORT} value={sort} onChange={setSort} accent={TT.blue} />
        </div>

        <TTable<Row>
          columns={columns}
          rows={filtered}
          onRowClick={(r) => nav(`/projects/${encodeURIComponent(r.projectPath)}`)}
          empty="No matching projects."
        />
      </TPanel>
    </div>
  );
}
