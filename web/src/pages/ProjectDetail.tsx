import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import { TBadge } from '@/components/terminal/Badge';
import { TBar } from '@/components/terminal/Bar';
import { TTable } from '@/components/terminal/Table';
import { SegBtn } from '@/components/terminal/SegBtn';
import { useProject } from '@/hooks/useProject';
import { useCostBreakdown } from '@/hooks/useCostBreakdown';
import { formatRelative, formatTokens, formatPercent } from '@/lib/format';
import { fmtUSD } from '@/lib/pricing';

const RANGES = ['7', '30', '90'] as const;
type RangeOpt = (typeof RANGES)[number];

export function ProjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const decoded = id ? decodeURIComponent(id) : '';
  const [days, setDays] = useState<RangeOpt>('30');
  const { data } = useProject(id, Number(days));
  const { data: cost } = useCostBreakdown(Number(days));

  if (!data) {
    return (
      <div style={{ padding: '20px 24px' }} className="tt-fade">
        <TPanel title="PROJECT">Loading…</TPanel>
      </div>
    );
  }

  const header = data.header;
  const name = header?.projectName ?? decoded;
  const mix = data.modelMix;
  const apiCost =
    cost?.byProject.find((p) => p.projectPath === decoded)?.totalUsd ?? 0;
  const mixTotal = mix ? mix.opus + mix.sonnet + mix.haiku + mix.other : 0;

  return (
    <div
      style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
      className="tt-fade"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link
          to="/projects"
          style={{
            color: TT.textMute,
            fontFamily: TT_MONO,
            fontSize: 11,
            textDecoration: 'none',
          }}
        >
          ← BACK_TO_PROJECTS
        </Link>
        <SegBtn options={RANGES} value={days} onChange={setDays} accent={TT.blue} />
      </div>

      <TPanel title={name.toUpperCase()} sub={`// ${decoded}`}>
        {header && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
            <Stat label="LAST_30D" value={formatTokens(header.totalTokens30d)} color={TT.green} />
            <Stat label="LAST_7D" value={formatTokens(header.totalTokens7d)} color={TT.green} />
            <Stat label="SESSIONS" value={String(header.sessionCount)} color={TT.blue} />
            <Stat label="TURNS" value={header.turnCount.toLocaleString()} color={TT.blue} />
            <Stat
              label="LAST_ACTIVITY"
              value={formatRelative(header.lastActivity)}
              color={TT.text}
            />
          </div>
        )}
      </TPanel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <TPanel title="CACHE_SCORE" accent={TT.green}>
          {data.cache ? (
            <>
              <div
                style={{
                  fontFamily: TT_MONO,
                  fontSize: 36,
                  color:
                    data.cache.effectiveness >= 0.95
                      ? TT.green
                      : data.cache.effectiveness >= 0.7
                        ? TT.amber
                        : TT.red,
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                {formatPercent(data.cache.effectiveness, 1)}
              </div>
              <div style={{ fontFamily: TT_MONO, fontSize: 10, color: TT.textMute }}>
                {formatTokens(data.cache.read)} reads · {formatTokens(data.cache.creation)} created
              </div>
            </>
          ) : (
            <span style={{ color: TT.textMute, fontSize: 11 }}>No cache data.</span>
          )}
        </TPanel>

        <TPanel title="API_EQUIVALENT" accent={TT.amber}>
          <div
            style={{
              fontFamily: TT_MONO,
              fontSize: 36,
              color: TT.amber,
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            {fmtUSD(apiCost)}
          </div>
          <div style={{ fontFamily: TT_MONO, fontSize: 10, color: TT.textMute }}>
            30d cost if billed at API rates
          </div>
        </TPanel>

        <TPanel title="SUBAGENT_X" accent={TT.purple}>
          {data.subagent ? (
            <>
              <div
                style={{
                  fontFamily: TT_MONO,
                  fontSize: 36,
                  color: TT.purple,
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                {data.subagent.multiplier.toFixed(2)}×
              </div>
              <div style={{ fontFamily: TT_MONO, fontSize: 10, color: TT.textMute }}>
                amplification from subagents
              </div>
            </>
          ) : (
            <span style={{ color: TT.textMute, fontSize: 11 }}>No subagents.</span>
          )}
        </TPanel>
      </div>

      {mix && mixTotal > 0 && (
        <TPanel title="MODEL_MIX" sub="// 30d normalized">
          <div style={{ display: 'flex', height: 14, marginBottom: 12 }}>
            <Slice flex={mix.opus / mixTotal} bg={TT.purple} label={`OPUS ${pct(mix.opus, mixTotal)}`} />
            <Slice flex={mix.sonnet / mixTotal} bg={TT.green} label={`SONNET ${pct(mix.sonnet, mixTotal)}`} />
            <Slice flex={mix.haiku / mixTotal} bg={TT.blue} label={`HAIKU ${pct(mix.haiku, mixTotal)}`} />
            <Slice
              flex={mix.other / mixTotal}
              bg="rgba(255,255,255,0.25)"
              label={`OTHER ${pct(mix.other, mixTotal)}`}
            />
          </div>
          <div style={{ display: 'flex', gap: 16, fontFamily: TT_MONO, fontSize: 10, color: TT.textMute }}>
            <span>
              <span style={{ background: TT.purple, width: 8, height: 8, display: 'inline-block', marginRight: 4 }} />
              Opus · {formatTokens(mix.opus)}
            </span>
            <span>
              <span style={{ background: TT.green, width: 8, height: 8, display: 'inline-block', marginRight: 4 }} />
              Sonnet · {formatTokens(mix.sonnet)}
            </span>
            <span>
              <span style={{ background: TT.blue, width: 8, height: 8, display: 'inline-block', marginRight: 4 }} />
              Haiku · {formatTokens(mix.haiku)}
            </span>
          </div>
        </TPanel>
      )}

      <TPanel
        title="ALL_SESSIONS"
        sub={`// ${data.sessions.length} sessions`}
      >
        <TTable<{
          sessionId: string;
          model: string;
          turns: number;
          last: string;
          sub: number;
        }>
          columns={[
            {
              key: 'sessionId',
              label: 'SESSION_ID',
              w: '180px',
              render: (r) => (
                <span style={{ color: TT.textMute, fontFamily: TT_MONO, fontSize: 10 }}>
                  {r.sessionId.slice(0, 14)}…
                  {r.sub ? (
                    <span style={{ color: TT.amber, marginLeft: 8 }}>↳ subagent</span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'model',
              label: 'MODEL',
              render: (r) => <span style={{ color: TT.text }}>{r.model || '—'}</span>,
            },
            {
              key: 'turns',
              label: 'TURNS',
              w: '70px',
              align: 'right',
              render: (r) => (
                <span style={{ color: TT.blue }}>{r.turns.toLocaleString()}</span>
              ),
            },
            {
              key: 'bar',
              label: '',
              w: '80px',
              render: (r) => {
                const max = Math.max(...data.sessions.map((s) => s.turn_count), 1);
                return <TBar pct={(r.turns / max) * 100} color={TT.blue} h={4} />;
              },
            },
            {
              key: 'last',
              label: 'LAST',
              w: '110px',
              align: 'right',
              render: (r) => <span style={{ color: TT.textMute }}>{r.last}</span>,
            },
          ]}
          rows={data.sessions.map((s) => ({
            sessionId: s.session_id,
            model: s.primary_model ?? '',
            turns: s.turn_count,
            last: formatRelative(s.last_ts),
            sub: s.is_subagent,
          }))}
          onRowClick={(r) => nav(`/sessions/${r.sessionId}`)}
        />
      </TPanel>

      {data.git?.isRepo && (
        <TPanel
          title="GIT_REPO"
          sub={`// branch ${data.git.branch ?? '—'} · ${data.git.commitCount} commits in window`}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.git.commits.slice(0, 12).map((c) => (
              <TBadge key={c.hash} color={TT.greenBright}>
                {c.hash.slice(0, 7)} · {c.subject.slice(0, 60)}
              </TBadge>
            ))}
          </div>
        </TPanel>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
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
      <div style={{ fontFamily: TT_MONO, fontSize: 18, color, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Slice({ flex, bg, label }: { flex: number; bg: string; label: string }) {
  if (flex <= 0) return null;
  return (
    <div
      style={{
        flex,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: TT_MONO,
        fontSize: 9,
        color: '#08090a',
        minWidth: flex > 0.06 ? 30 : 0,
      }}
    >
      {flex > 0.06 ? label : ''}
    </div>
  );
}

function pct(n: number, total: number): string {
  return `${Math.round((n / total) * 100)}%`;
}
