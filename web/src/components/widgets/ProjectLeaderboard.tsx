import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useProjects } from '@/hooks/useProjects';
import { formatRelative, formatTokens } from '@/lib/format';

type SortKey = 'lastTouched' | 'totalTokens' | 'sessionCount';

export function ProjectLeaderboard() {
  const { data, isLoading } = useProjects();
  const [sort, setSort] = useState<SortKey>('lastTouched');
  if (isLoading || !data) return <Skeleton className="h-96" />;

  const rows = [...data.projects].sort((a, b) => {
    if (sort === 'lastTouched') return b.lastTouched.localeCompare(a.lastTouched);
    if (sort === 'totalTokens') return b.totalTokens - a.totalTokens;
    return b.sessionCount - a.sessionCount;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <div className="flex gap-2 pt-2">
          {(['lastTouched', 'totalTokens', 'sessionCount'] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`text-xs px-2.5 py-1 rounded-md border ${
                sort === k
                  ? 'bg-accent text-foreground border-border'
                  : 'text-muted-foreground border-transparent hover:border-border'
              }`}
            >
              {k === 'lastTouched' ? 'Recent' : k === 'totalTokens' ? 'Tokens' : 'Sessions'}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground text-left tracking-wide">
            <tr>
              <th className="pb-2">Project</th>
              <th className="pb-2 text-right">Last touched</th>
              <th className="pb-2 text-right">Sessions</th>
              <th className="pb-2 text-right">Tokens</th>
              <th className="pb-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.projectPath} className="border-t border-border">
                <td className="py-2">
                  <Link
                    to={`/projects/${encodeURIComponent(p.projectPath)}`}
                    className="hover:underline"
                  >
                    {p.projectName}
                  </Link>
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {formatRelative(p.lastTouched)}
                </td>
                <td className="py-2 text-right tabular-nums">{p.sessionCount}</td>
                <td className="py-2 text-right tabular-nums">{formatTokens(p.totalTokens)}</td>
                <td className="py-2 text-right">
                  {p.isActive ? (
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    >
                      active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      idle
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
