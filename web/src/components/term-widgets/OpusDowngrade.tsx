import { useNavigate } from 'react-router-dom';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TBadge } from '@/components/terminal/Badge';
import { TTable } from '@/components/terminal/Table';
import { useModelRecommendations } from '@/hooks/useToolUse';

interface Row {
  projectName: string;
  projectPath: string;
  calls: number;
  opusPct: number;
}

export function OpusDowngradePanel() {
  const { data } = useModelRecommendations(30);
  const nav = useNavigate();
  if (!data) return <TPanel title="OPUS_DOWNGRADE_CANDIDATES">Loading…</TPanel>;

  const rows: Row[] = data.recommendations
    .filter((r) => r.opusToolHeavyRatio > 0)
    .sort((a, b) => b.opusToolHeavyRatio - a.opusToolHeavyRatio)
    .slice(0, 12)
    .map((r) => ({
      projectName: r.projectName,
      projectPath: r.projectPath,
      calls: r.toolCalls,
      opusPct: Math.round(r.opusToolHeavyRatio * 100),
    }));

  return (
    <TPanel
      title="OPUS_DOWNGRADE_CANDIDATES"
      sub="// mechanical workload heuristic"
      action={rows.length > 0 ? 'ACTION REQ' : 'CLEAN'}
      accent={TT.amber}
    >
      <div style={{ fontFamily: TT_MONO, fontSize: 10, color: TT.textMute, marginBottom: 12 }}>
        Projects where Opus does heavy mechanical work (Read / Bash / Write / Grep). Routing to
        Haiku or Sonnet could save significant cost.
      </div>
      <TTable<Row>
        columns={[
          {
            key: 'projectName',
            label: 'PROJECT',
            render: (r) => <span style={{ color: TT.text }}>{r.projectName}</span>,
          },
          {
            key: 'calls',
            label: 'CALLS',
            w: '90px',
            align: 'right',
            render: (r) => (
              <span style={{ color: TT.textMute }}>{r.calls.toLocaleString()}</span>
            ),
          },
          {
            key: 'opus',
            label: 'OPUS%',
            w: '70px',
            align: 'right',
            render: (r) => (
              <TBadge color={r.opusPct >= 80 ? TT.red : TT.amber}>{r.opusPct}%</TBadge>
            ),
          },
        ]}
        rows={rows}
        onRowClick={(r) => nav(`/projects/${encodeURIComponent(r.projectPath)}`)}
        empty="No mechanical-Opus overspending detected."
      />
    </TPanel>
  );
}
