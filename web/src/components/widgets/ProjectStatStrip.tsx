import { Card, CardContent } from '@/components/ui/card';
import { formatRelative, formatTokens } from '@/lib/format';
import type { ProjectHeader } from '@/hooks/useProject';

export function ProjectStatStrip({ header }: { header: ProjectHeader }) {
  return (
    <Card>
      <CardContent className="p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-x-6 gap-y-3">
        <Stat label="Lifetime tokens" value={formatTokens(header.totalTokensLifetime)} />
        <Stat label="Last 30d" value={formatTokens(header.totalTokens30d)} />
        <Stat label="Last 7d" value={formatTokens(header.totalTokens7d)} />
        <Stat label="Sessions" value={String(header.sessionCount)} />
        <Stat label="Total turns" value={header.turnCount.toLocaleString()} />
        <Stat label="Primary model" value={header.primaryModel ?? '—'} mono />
        <Stat label="Last activity" value={formatRelative(header.lastActivity)} />
        {header.gitBranches.length > 0 && (
          <Stat
            label="Git branches"
            value={header.gitBranches.slice(0, 3).join(', ') + (header.gitBranches.length > 3 ? `, +${header.gitBranches.length - 3}` : '')}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-medium ${mono ? 'font-mono text-xs' : 'tabular-nums'} truncate`}>
        {value}
      </div>
    </div>
  );
}
