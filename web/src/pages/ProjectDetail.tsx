import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject } from '@/hooks/useProject';
import { formatRelative } from '@/lib/format';
import { ProjectStatStrip } from '@/components/widgets/ProjectStatStrip';
import {
  CacheScoreCard,
  ModelMixCard,
  SubagentCard,
  CacheTtlCard,
  EntrypointCard,
} from '@/components/widgets/ProjectInsightCards';
import { ActivityChart } from '@/components/widgets/ActivityChart';
import { CacheOverTimeChart } from '@/components/widgets/CacheOverTimeChart';
import { ModelMixOverTimeChart } from '@/components/widgets/ModelMixOverTimeChart';
import { TopSessionsChart } from '@/components/widgets/TopSessionsChart';
import { GitStatsCard } from '@/components/widgets/GitStatsCard';

const RANGES = [7, 30, 90] as const;

export function ProjectDetail() {
  const { id } = useParams();
  const decoded = id ? decodeURIComponent(id) : '';
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = useProject(id, days);

  if (isLoading || !data) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projects" className="text-sm text-muted-foreground hover:underline">
          ← Projects
        </Link>
        <div className="flex items-center justify-between mt-1 gap-4">
          <h2 className="text-2xl font-semibold tracking-tight break-all">
            {data.header?.projectName ?? decoded}
          </h2>
          <div className="flex gap-1 shrink-0">
            {RANGES.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`text-xs px-2.5 py-1 rounded-md border ${
                  days === d
                    ? 'bg-accent text-foreground border-border'
                    : 'text-muted-foreground border-transparent hover:border-border'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-1 font-mono break-all">{decoded}</div>
      </div>

      {data.header && <ProjectStatStrip header={data.header} />}

      <div className="grid gap-6 lg:grid-cols-3">
        {data.cache && <CacheScoreCard cache={data.cache} days={data.days} />}
        {data.modelMix && <ModelMixCard mix={data.modelMix} days={data.days} />}
        {data.subagent && <SubagentCard stats={data.subagent} days={data.days} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityChart data={data.activity} />
        <CacheOverTimeChart data={data.cacheOverTime} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ModelMixOverTimeChart data={data.modelMixOverTime} />
        <TopSessionsChart data={data.topSessions} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {data.cacheTtl && <CacheTtlCard ttl={data.cacheTtl} days={data.days} />}
        <EntrypointCard data={data.entrypoints} />
      </div>

      <GitStatsCard
        git={data.git}
        totalTokens={data.header?.totalTokens30d ?? 0}
        days={data.days}
      />

      <Card>
        <CardHeader>
          <CardTitle>All sessions ({data.sessions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground text-left tracking-wide">
              <tr>
                <th className="pb-2">Session</th>
                <th className="pb-2">Model</th>
                <th className="pb-2 text-right">Turns</th>
                <th className="pb-2 text-right">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.session_id} className="border-t border-border">
                  <td className="py-2 font-mono text-xs">
                    <Link to={`/sessions/${s.session_id}`} className="hover:underline">
                      {s.session_id.slice(0, 12)}…
                      {s.is_subagent ? (
                        <span className="ml-2 text-amber-400">↳ subagent</span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="py-2 text-muted-foreground">{s.primary_model ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">{s.turn_count}</td>
                  <td className="py-2 text-right text-muted-foreground">
                    {formatRelative(s.last_ts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
