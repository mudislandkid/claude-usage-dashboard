import { useNavigate } from 'react-router-dom';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TBar } from '@/components/terminal/Bar';
import { TTable } from '@/components/terminal/Table';
import { useCacheScore } from '@/hooks/useCacheScore';
import { formatTokens } from '@/lib/format';

interface Row {
  idx: string;
  project: string;
  projectPath: string;
  score: number;
}

export function CacheEffectivenessPanel() {
  const { data } = useCacheScore();
  const nav = useNavigate();
  if (!data) return <TPanel title="CACHE_EFFECTIVENESS">Loading…</TPanel>;

  const overall = (data.overall.effectiveness * 100).toFixed(1);

  const rows: Row[] = [...data.byProject]
    .sort((a, b) => a.effectiveness - b.effectiveness)
    .slice(0, 10)
    .map((r, i) => ({
      idx: String(i + 1).padStart(2, '0'),
      project: r.projectName,
      projectPath: r.projectPath,
      score: r.effectiveness * 100,
    }));

  const totalReads = data.byProject.reduce((a, b) => a + b.cacheReadTokens, 0);
  const totalCreation = data.byProject.reduce((a, b) => a + b.cacheCreationTokens, 0);
  const totalInput = data.byProject.reduce((a, b) => a + b.inputTokens, 0);

  return (
    <TPanel title="CACHE_EFFECTIVENESS" sub="// 7d window" action={`SCORE ${overall}%`}>
      <div style={{ fontFamily: TT_MONO, fontSize: 10, color: TT.textMute, marginBottom: 10 }}>
        {formatTokens(totalReads)} reads · {formatTokens(totalCreation)} created ·{' '}
        {formatTokens(totalInput)} fresh input
      </div>
      <TTable<Row>
        columns={[
          { key: 'idx', label: '#', w: '24px' },
          { key: 'project', label: 'PROJECT' },
          {
            key: 'score',
            label: 'SCORE',
            w: '70px',
            align: 'right',
            render: (r) => (
              <span style={{ color: r.score < 50 ? TT.red : r.score < 90 ? TT.amber : TT.green }}>
                {r.score.toFixed(1)}%
              </span>
            ),
          },
          {
            key: 'bar',
            label: '',
            w: '40px',
            render: (r) => (
              <TBar
                pct={r.score}
                color={r.score < 50 ? TT.red : r.score < 90 ? TT.amber : TT.green}
                h={3}
              />
            ),
          },
        ]}
        rows={rows}
        onRowClick={(r) => nav(`/projects/${encodeURIComponent(r.projectPath)}`)}
      />
    </TPanel>
  );
}
