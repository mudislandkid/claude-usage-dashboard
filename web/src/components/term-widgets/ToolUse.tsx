import { TT } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TBar } from '@/components/terminal/Bar';
import { TTable } from '@/components/terminal/Table';
import { useToolUse } from '@/hooks/useToolUse';

interface Row {
  idx: string;
  name: string;
  count: number;
}

const MECHANICAL = new Set(['Bash', 'Edit', 'Write', 'Read', 'Grep', 'Glob']);
const SUBAGENT = new Set(['Agent', 'TaskCreate', 'TaskUpdate', 'TaskOutput', 'TaskStop']);
const NETWORK = new Set(['WebFetch', 'WebSearch', 'ToolSearch']);

function colorFor(name: string): string {
  if (MECHANICAL.has(name)) return TT.green;
  if (SUBAGENT.has(name)) return TT.purple;
  if (NETWORK.has(name)) return TT.blue;
  return TT.textMute;
}

export function ToolUsePanel() {
  const { data } = useToolUse(30);
  if (!data) return <TPanel title="TOOL_USE">Loading…</TPanel>;

  const tools = data.tools.slice(0, 12);
  const max = tools[0]?.count ?? 1;

  const rows: Row[] = tools.map((t, i) => ({
    idx: String(i + 1).padStart(2, '0'),
    name: t.toolName,
    count: t.count,
  }));

  return (
    <TPanel title="TOOL_USE" sub="// 30d" action={`TOP ${tools.length}`}>
      <TTable<Row>
        columns={[
          { key: 'idx', label: '#', w: '24px' },
          {
            key: 'name',
            label: 'TOOL',
            w: '130px',
            render: (t) => <span style={{ color: colorFor(t.name) }}>{t.name}</span>,
          },
          {
            key: 'bar',
            label: 'COUNT',
            render: (t) => <TBar pct={(t.count / max) * 100} color={colorFor(t.name)} h={4} />,
          },
          {
            key: 'count',
            label: 'N',
            w: '70px',
            align: 'right',
            render: (t) => <span style={{ color: TT.text }}>{t.count.toLocaleString()}</span>,
          },
        ]}
        rows={rows}
      />
    </TPanel>
  );
}
