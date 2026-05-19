import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TBadge } from '@/components/terminal/Badge';
import { TTable, type TColumn } from '@/components/terminal/Table';
import { SegBtn } from '@/components/terminal/SegBtn';
import { useProjects } from '@/hooks/useProjects';
import { useCostBreakdown } from '@/hooks/useCostBreakdown';
import { formatTokens, formatRelative } from '@/lib/format';
import { fmtUSDCompact } from '@/lib/pricing';
import {
  buildProjectTree,
  filterByStatus,
  filterTree,
  flattenTree,
  sortTree,
  type FlatRow,
  type SortKey,
} from '@/lib/projectTree';

const STATUS = ['all', 'active', 'idle'] as const;
const SORT = ['recent', 'tokens', 'sessions'] as const;

type StatusOpt = (typeof STATUS)[number];

export function Projects() {
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<StatusOpt>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data } = useProjects();
  const { data: cost } = useCostBreakdown(0); // 0 = all-time
  const nav = useNavigate();

  const costByPath = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of cost?.byProject ?? []) m.set(p.projectPath, p.totalUsd);
    return m;
  }, [cost]);

  const rows = useMemo<FlatRow[]>(() => {
    if (!data) return [];
    let tree = buildProjectTree(data.projects, costByPath);
    tree = sortTree(tree, sort);
    tree = filterByStatus(tree, status);

    let forceExpand: Set<string> | null = null;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      const res = filterTree(
        tree,
        (n) =>
          n.project.projectName.toLowerCase().includes(q) ||
          n.project.projectPath.toLowerCase().includes(q),
      );
      tree = res.tree;
      forceExpand = res.expandPaths;
    }

    const effectiveExpanded = forceExpand
      ? new Set([...expanded, ...forceExpand])
      : expanded;
    return flattenTree(tree, effectiveExpanded);
  }, [data, costByPath, sort, status, filter, expanded]);

  const totalTokens = rows.reduce(
    (a, r) => (r.depth === 0 ? a + r.node.rollup.totalTokens : a),
    0,
  );

  const visibleNodeCount = rows.length;
  const totalProjectCount = data?.projects.length ?? 0;

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const columns: TColumn<FlatRow>[] = [
    {
      key: 'idx',
      label: '#',
      w: '34px',
      render: (r) => {
        const num = rows.indexOf(r) + 1;
        return (
          <span style={{ color: TT.textDim }}>
            {String(num).padStart(2, '0')}
          </span>
        );
      },
    },
    {
      key: 'name',
      label: 'PROJECT',
      w: '300px',
      render: (r) => <NameCell row={r} onToggle={toggle} />,
    },
    {
      key: 'path',
      label: 'PATH',
      render: (r) => (
        <span style={{ color: TT.textMute, fontSize: 10 }}>
          {r.node.project.projectPath}
        </span>
      ),
    },
    {
      key: 'lastTouched',
      label: 'LAST',
      w: '90px',
      align: 'right',
      render: (r) => (
        <span style={{ color: TT.textMute }}>
          {formatRelative(r.node.rollup.lastTouched)}
        </span>
      ),
    },
    {
      key: 'sessions',
      label: 'SESS',
      w: '60px',
      align: 'right',
      render: (r) => (
        <RollupNumber
          own={r.node.project.sessionCount}
          total={r.node.rollup.sessionCount}
          color={TT.blue}
          hasChildren={r.hasChildren}
        />
      ),
    },
    {
      key: 'tokens',
      label: 'TOKENS',
      w: '90px',
      align: 'right',
      render: (r) => (
        <RollupNumber
          own={r.node.project.totalTokens}
          total={r.node.rollup.totalTokens}
          color={TT.green}
          hasChildren={r.hasChildren}
          format={formatTokens}
        />
      ),
    },
    {
      key: 'cost',
      label: 'API $',
      w: '90px',
      align: 'right',
      render: (r) => {
        const total = r.node.rollup.apiCost;
        const own = r.node.apiCost;
        const showRollup = r.hasChildren && total !== own;
        const value = showRollup ? total : own;
        return (
          <span style={{ color: value > 100 ? TT.amber : TT.textMute }}>
            {value < 0.01 ? '<$0.01' : fmtUSDCompact(value)}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'STATUS',
      w: '70px',
      align: 'right',
      render: (r) => (
        <TBadge color={r.node.rollup.isActive ? TT.green : TT.textMute}>
          {r.node.rollup.isActive ? 'active' : 'idle'}
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
        sub={`// ${visibleNodeCount} of ${totalProjectCount}`}
        action={`${formatTokens(totalTokens)} TOTAL · ALL TIME`}
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

        <TTable<FlatRow>
          columns={columns}
          rows={rows}
          onRowClick={(r) =>
            nav(`/projects/${encodeURIComponent(r.node.project.projectPath)}`)
          }
          empty="No matching projects."
        />
      </TPanel>
    </div>
  );
}

interface NameCellProps {
  row: FlatRow;
  onToggle: (path: string) => void;
}

function NameCell({ row, onToggle }: NameCellProps) {
  const indent = row.depth * 14;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        paddingLeft: indent,
        color: TT.text,
        minWidth: 0,
      }}
    >
      {row.hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(row.node.project.projectPath);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: TT.textDim,
            cursor: 'pointer',
            padding: 0,
            width: 12,
            fontFamily: TT_MONO,
            fontSize: 10,
            lineHeight: 1,
          }}
          aria-label={row.isExpanded ? 'Collapse' : 'Expand'}
        >
          {row.isExpanded ? '▾' : '▸'}
        </button>
      ) : (
        <span style={{ width: 12, color: TT.textDim, fontSize: 10 }}>
          {row.depth > 0 ? '·' : ''}
        </span>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {row.node.project.projectName}
      </span>
      {row.hasChildren && (
        <span style={{ color: TT.textDim, fontSize: 10 }}>
          +{row.node.rollup.descendantCount}
        </span>
      )}
    </span>
  );
}

interface RollupNumberProps {
  own: number;
  total: number;
  color: string;
  hasChildren: boolean;
  format?: (n: number) => string;
}

function RollupNumber({
  own,
  total,
  color,
  hasChildren,
  format,
}: RollupNumberProps) {
  const fmt = format ?? ((n: number) => String(n));
  const showRollup = hasChildren && total !== own;
  return (
    <span style={{ color }}>
      {fmt(showRollup ? total : own)}
    </span>
  );
}

