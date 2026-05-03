import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useParams, Link } from 'react-router-dom';
import { useSession } from '@/hooks/useSession';
import { formatRelative, formatTokens } from '@/lib/format';

export function SubagentTree() {
  const { id } = useParams();
  const { data, isLoading } = useSession(id);
  if (isLoading || !data) return <Skeleton className="h-72" />;

  const total = data.turns.reduce(
    (acc, t) =>
      acc +
      t.input_tokens +
      t.output_tokens +
      t.cache_read_tokens +
      t.cache_creation_tokens,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-sm">Session {id}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <Stat label="Project" value={data.session?.project_name ?? '—'} />
          <Stat label="Model" value={data.session?.primary_model ?? '—'} />
          <Stat label="Started" value={formatRelative(data.session?.first_ts)} />
          <Stat label="Last activity" value={formatRelative(data.session?.last_ts)} />
          <Stat label="Total turns" value={String(data.session?.turn_count ?? 0)} />
          <Stat label="Total tokens" value={formatTokens(total)} />
        </div>
        {data.subagents.length > 0 && (
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2 tracking-wide">
              Subagents ({data.subagents.length})
            </div>
            <ul className="space-y-1">
              {data.subagents.map((sa) => (
                <li
                  key={sa.session_id}
                  className="flex justify-between border-b border-border py-1"
                >
                  <Link
                    to={`/sessions/${sa.session_id}`}
                    className="hover:underline truncate max-w-[60%] font-mono text-xs"
                  >
                    {sa.session_id}
                  </Link>
                  <span className="text-muted-foreground tabular-nums text-xs">
                    {sa.turn_count} turns • {sa.primary_model ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
