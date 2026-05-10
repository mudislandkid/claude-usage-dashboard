import { useNavigate } from 'react-router-dom';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TTable } from '@/components/terminal/Table';
import { useRangeDays, useRangeLabel } from '@/components/terminal/RangeContext';
import { useModelMix } from '@/hooks/useModelMix';
import { formatTokens } from '@/lib/format';

interface Row {
  idx: string;
  projectName: string;
  projectPath: string;
  opus: number;
  sonnet: number;
  haiku: number;
  other: number;
  total: number;
}

export function ModelMixPanel() {
  const days = useRangeDays();
  const label = useRangeLabel();
  const { data } = useModelMix(days);
  const nav = useNavigate();
  if (!data) return <TPanel title="MODEL_MIX_PER_PROJECT">Loading…</TPanel>;

  const rows: Row[] = data.rows
    .map((r) => ({
      projectName: r.projectName,
      projectPath: r.projectPath,
      opus: r.opusTokens,
      sonnet: r.sonnetTokens,
      haiku: r.haikuTokens,
      other: r.otherTokens,
      total: r.opusTokens + r.sonnetTokens + r.haikuTokens + r.otherTokens,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)
    .map((r, i) => ({ ...r, idx: String(i + 1).padStart(2, '0') }));

  return (
    <TPanel
      title="MODEL_MIX_PER_PROJECT"
      sub={`// ${label} normalized`}
      action="OPUS · SONNET · HAIKU · OTHER"
    >
      <TTable<Row>
        columns={[
          { key: 'idx', label: '#', w: '24px' },
          {
            key: 'projectName',
            label: 'PROJECT',
            w: '240px',
            render: (r) => <span style={{ color: TT.text }}>{r.projectName}</span>,
          },
          {
            key: 'bar',
            label: 'DISTRIBUTION',
            render: (m) => {
              const total = m.total || 1;
              return (
                <div style={{ display: 'flex', height: 10, width: '100%' }}>
                  <div style={{ flex: m.opus / total, background: TT.purple }} title={`Opus ${formatTokens(m.opus)}`} />
                  <div style={{ flex: m.sonnet / total, background: TT.green }} title={`Sonnet ${formatTokens(m.sonnet)}`} />
                  <div style={{ flex: m.haiku / total, background: TT.blue }} title={`Haiku ${formatTokens(m.haiku)}`} />
                  <div style={{ flex: m.other / total, background: 'rgba(255,255,255,0.18)' }} />
                </div>
              );
            },
          },
          {
            key: 'tokens',
            label: 'TOKENS',
            w: '90px',
            align: 'right',
            render: (m) => <span style={{ color: TT.green }}>{formatTokens(m.total)}</span>,
          },
        ]}
        rows={rows}
        onRowClick={(r) => nav(`/projects/${encodeURIComponent(r.projectPath)}`)}
      />
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 16,
          fontFamily: TT_MONO,
          fontSize: 10,
          color: TT.textMute,
        }}
      >
        <Legend c={TT.purple} l="Opus" />
        <Legend c={TT.green} l="Sonnet" />
        <Legend c={TT.blue} l="Haiku" />
        <Legend c="rgba(255,255,255,0.25)" l="Other" />
      </div>
    </TPanel>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, background: c }} />
      {l}
    </span>
  );
}
