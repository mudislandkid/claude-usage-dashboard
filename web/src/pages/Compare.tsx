import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useProjects } from '@/hooks/useProjects';
import { useProject } from '@/hooks/useProject';
import { formatPercent, formatRelative, formatTokens } from '@/lib/format';
import type { ProjectRow } from '@/hooks/useProjects';

export function Compare() {
  const [params, setParams] = useSearchParams();
  const initial = useMemo(() => params.get('p')?.split(',').filter(Boolean) ?? [], [params]);
  const [selected, setSelected] = useState<string[]>(initial);
  const [query, setQuery] = useState('');
  const { data: projects } = useProjects();

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = query.trim().toLowerCase();
    if (!q) return projects.projects.slice(0, 30);
    return projects.projects
      .filter(
        (p) =>
          p.projectName.toLowerCase().includes(q) ||
          p.projectPath.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [projects, query]);

  function toggle(path: string) {
    const next = selected.includes(path)
      ? selected.filter((p) => p !== path)
      : selected.length >= 4
        ? selected
        : [...selected, path];
    setSelected(next);
    setParams({ p: next.join(',') });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Compare projects</h2>

      <Card>
        <CardHeader>
          <CardTitle>Pick up to 4 projects</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            className="bg-input rounded-md px-3 py-2 text-sm w-full max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            {filtered.map((p) => {
              const isSelected = selected.includes(p.projectPath);
              return (
                <button
                  key={p.projectPath}
                  onClick={() => toggle(p.projectPath)}
                  disabled={!isSelected && selected.length >= 4}
                  className={`text-xs px-2.5 py-1.5 rounded-md border ${
                    isSelected
                      ? 'bg-accent text-foreground border-border'
                      : 'text-muted-foreground border-transparent hover:border-border'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  {p.projectName}
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => { setSelected([]); setParams({}); }}>
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {selected.length === 0 ? (
        <div className="text-sm text-muted-foreground">Select 2–4 projects to compare.</div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${selected.length}, minmax(0, 1fr))` }}
        >
          {selected.map((path) => (
            <CompareColumn key={path} projectPath={path} listEntry={projects?.projects.find((p) => p.projectPath === path) ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompareColumn({
  projectPath,
  listEntry,
}: {
  projectPath: string;
  listEntry: ProjectRow | null;
}) {
  const { data, isLoading } = useProject(projectPath, 30);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm break-all">{listEntry?.projectName ?? projectPath}</CardTitle>
        <p className="text-[10px] text-muted-foreground font-mono break-all">{projectPath}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {isLoading || !data ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : !data.header ? (
          <div className="text-muted-foreground">No data.</div>
        ) : (
          <>
            <Stat label="Last 30d" value={formatTokens(data.header.totalTokens30d)} />
            <Stat label="Last 7d" value={formatTokens(data.header.totalTokens7d)} />
            <Stat label="Sessions" value={String(data.header.sessionCount)} />
            <Stat label="Turns" value={data.header.turnCount.toLocaleString()} />
            <Stat label="Last activity" value={formatRelative(data.header.lastActivity)} />
            <Stat
              label="Cache score"
              value={data.cache ? formatPercent(data.cache.effectiveness, 1) : '—'}
              hint={
                data.cache && data.cache.effectiveness >= 0.7
                  ? 'green'
                  : data.cache && data.cache.effectiveness >= 0.4
                    ? 'amber'
                    : 'red'
              }
            />
            <Stat
              label="Subagent multiplier"
              value={data.subagent ? `${data.subagent.multiplier.toFixed(2)}×` : '—'}
            />
            <Stat
              label="1h cache TTL"
              value={data.cacheTtl ? formatPercent(data.cacheTtl.ratio1h) : '—'}
            />
            <Stat
              label="Git commits (30d)"
              value={data.git?.isRepo ? String(data.git.commitCount) : 'n/a'}
            />
            {data.modelMix && (
              <div className="pt-1">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1">Model mix</div>
                <ModelMixBar mix={data.modelMix} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: 'green' | 'amber' | 'red';
}) {
  const cls =
    hint === 'green'
      ? 'text-emerald-300'
      : hint === 'amber'
        ? 'text-amber-300'
        : hint === 'red'
          ? 'text-red-300'
          : '';
  return (
    <div className="flex justify-between border-b border-border pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

function ModelMixBar({
  mix,
}: {
  mix: { opus: number; sonnet: number; haiku: number; other: number };
}) {
  const total = mix.opus + mix.sonnet + mix.haiku + mix.other;
  if (total === 0) return <div className="text-muted-foreground">—</div>;
  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
  return (
    <div className="flex h-2 rounded overflow-hidden bg-muted">
      {mix.opus > 0 && <div style={{ width: pct(mix.opus), background: 'hsl(280 70% 60%)' }} title={`Opus ${pct(mix.opus)}`} />}
      {mix.sonnet > 0 && <div style={{ width: pct(mix.sonnet), background: 'hsl(210 80% 60%)' }} title={`Sonnet ${pct(mix.sonnet)}`} />}
      {mix.haiku > 0 && <div style={{ width: pct(mix.haiku), background: 'hsl(160 70% 50%)' }} title={`Haiku ${pct(mix.haiku)}`} />}
      {mix.other > 0 && <div style={{ width: pct(mix.other), background: 'hsl(var(--muted-foreground))' }} title={`Other ${pct(mix.other)}`} />}
    </div>
  );
}
