import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject } from '@/hooks/useProject';
import { formatRelative } from '@/lib/format';

export function ProjectDetail() {
  const { id } = useParams();
  const decoded = id ? decodeURIComponent(id) : '';
  const { data, isLoading } = useProject(id);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projects" className="text-sm text-muted-foreground hover:underline">
          ← Projects
        </Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-1 break-all">{decoded}</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-40" />
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
