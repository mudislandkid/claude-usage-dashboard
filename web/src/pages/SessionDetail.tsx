import { useParams, Link } from 'react-router-dom';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TBadge } from '@/components/terminal/Badge';
import { useSession } from '@/hooks/useSession';
import { formatRelative, formatTokens } from '@/lib/format';

export function SessionDetail() {
  const { id } = useParams();
  const { data } = useSession(id);

  if (!data) {
    return (
      <div style={{ padding: '20px 24px' }} className="tt-fade">
        <TPanel title="SESSION">Loading…</TPanel>
      </div>
    );
  }

  const total = data.turns.reduce(
    (a, t) =>
      a + t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens,
    0,
  );

  return (
    <div
      style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
      className="tt-fade"
    >
      <Link
        to="/projects"
        style={{ color: TT.textMute, fontFamily: TT_MONO, fontSize: 11, textDecoration: 'none' }}
      >
        ← BACK
      </Link>

      <TPanel title={`SESSION ${id?.slice(0, 14) ?? ''}…`} sub={`// full id: ${id}`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Stat label="PROJECT" value={data.session?.project_name ?? '—'} color={TT.text} />
          <Stat label="MODEL" value={data.session?.primary_model ?? '—'} color={TT.purple} />
          <Stat label="TURNS" value={String(data.session?.turn_count ?? 0)} color={TT.blue} />
          <Stat label="STARTED" value={formatRelative(data.session?.first_ts)} color={TT.textMute} />
          <Stat
            label="LAST_ACTIVITY"
            value={formatRelative(data.session?.last_ts)}
            color={TT.textMute}
          />
          <Stat label="TOTAL_TOKENS" value={formatTokens(total)} color={TT.green} />
        </div>
      </TPanel>

      {data.subSessions && data.subSessions.length > 1 && (
        <TPanel
          title="SUB_SESSIONS"
          sub={`// ${data.subSessions.length} logical segments · gaps > 30 min`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.subSessions.map((ss, i) => (
              <div
                key={ss.startTs}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: `1px dashed ${TT.border}`,
                  padding: '6px 0',
                  fontFamily: TT_MONO,
                  fontSize: 11,
                }}
              >
                <span style={{ color: TT.textMute }}>
                  #{i + 1}: {formatRelative(ss.startTs)} → {formatRelative(ss.endTs)} ·{' '}
                  {Math.round(ss.durationMinutes)}m
                </span>
                <span style={{ color: TT.green }}>
                  {ss.turns} turns · {formatTokens(ss.totalTokens)}
                </span>
              </div>
            ))}
          </div>
        </TPanel>
      )}

      {data.subagents.length > 0 && (
        <TPanel title="SUBAGENTS" sub={`// ${data.subagents.length}`} accent={TT.purple}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.subagents.map((sa) => (
              <Link
                key={sa.session_id}
                to={`/sessions/${sa.session_id}`}
                style={{ textDecoration: 'none' }}
              >
                <TBadge color={TT.purple}>
                  {sa.session_id.slice(0, 10)}… · {sa.turn_count}t · {sa.primary_model ?? '—'}
                </TBadge>
              </Link>
            ))}
          </div>
        </TPanel>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: TT_MONO,
          fontSize: 9,
          color: TT.textDim,
          letterSpacing: '0.10em',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: TT_MONO, fontSize: 16, color, fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}
