import { useNavigate } from 'react-router-dom';
import { TT } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TBadge } from '@/components/terminal/Badge';
import { TBar } from '@/components/terminal/Bar';
import { TTable } from '@/components/terminal/Table';
import { useWorstCacheSessions } from '@/hooks/useInsights';
import { formatTokens } from '@/lib/format';

interface Row {
  sessionId: string;
  project: string;
  tokens: number;
  score: number;
}

export function WorstSessionsPanel() {
  const { data } = useWorstCacheSessions(30);
  const nav = useNavigate();
  if (!data) return <TPanel title="WORST_OFFENDER_SESSIONS">Loading…</TPanel>;

  const rows: Row[] = data.sessions.slice(0, 10).map((s) => ({
    sessionId: s.sessionId,
    project: s.projectName,
    tokens: s.totalTokens,
    score: s.effectiveness * 100,
  }));

  return (
    <TPanel
      title="WORST_OFFENDER_SESSIONS"
      sub="// 30d · large sessions w/ low cache score"
      action="OPTIMIZATION TARGETS"
      accent={TT.red}
    >
      <TTable<Row>
        columns={[
          { key: 'project', label: 'PROJECT', w: '220px' },
          {
            key: 'sessionId',
            label: 'SESSION_ID',
            w: '160px',
            render: (r) => (
              <span style={{ color: TT.textMute }}>{r.sessionId.slice(0, 12) + '…'}</span>
            ),
          },
          {
            key: 'tokens',
            label: 'TOKENS',
            w: '100px',
            align: 'right',
            render: (r) => <span style={{ color: TT.blue }}>{formatTokens(r.tokens)}</span>,
          },
          {
            key: 'score',
            label: 'CACHE SCORE',
            w: '120px',
            align: 'right',
            render: (r) => (
              <TBadge color={r.score < 80 ? TT.red : TT.amber}>{r.score.toFixed(1)}%</TBadge>
            ),
          },
          {
            key: 'bar',
            label: '',
            render: (r) => (
              <TBar pct={r.score} color={r.score < 80 ? TT.red : TT.amber} h={4} />
            ),
          },
        ]}
        rows={rows}
        onRowClick={(r) => nav(`/sessions/${r.sessionId}`)}
        empty="No sessions over 200k tokens."
      />
    </TPanel>
  );
}
