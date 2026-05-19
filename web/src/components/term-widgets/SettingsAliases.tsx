import { useMemo, useState } from 'react';
import { TT, TT_MONO } from '@/components/terminal/tokens';
import { TPanel } from '@/components/terminal/Panel';
import {
  useAliasCandidates,
  useDeleteAlias,
  usePathAliases,
  useUpsertAlias,
} from '@/hooks/usePathAliases';

export function SettingsAliasesPanel() {
  const { data: aliasData } = usePathAliases();
  const { data: candidateData } = useAliasCandidates();
  const upsert = useUpsertAlias();
  const del = useDeleteAlias();

  const aliases = aliasData?.aliases ?? [];
  const candidates = useMemo(
    () => [...(candidateData?.paths ?? [])].sort(),
    [candidateData],
  );

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(from) && Boolean(to) && from !== to && !upsert.isPending;

  async function submit() {
    setError(null);
    if (!from || !to) {
      setError('Pick a "from" and "to" path.');
      return;
    }
    if (from === to) {
      setError('From and To must be different.');
      return;
    }
    try {
      await upsert.mutateAsync({ from, to });
      setFrom('');
      setTo('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save alias.');
    }
  }

  return (
    <TPanel
      title="PROJECT_ALIASES"
      sub="// merge project paths under one canonical name"
    >
      <p
        style={{
          fontFamily: TT_MONO,
          fontSize: 11,
          color: TT.textMute,
          marginTop: 0,
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        When you move or rename a project, its old path keeps appearing as a
        separate entry on the Projects page. Add an alias to fold every old
        location (and any sub-paths under it) into the new canonical path.
        Aliasing is non-destructive — remove the alias to see the originals again.
      </p>

      {aliases.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>CURRENT ALIASES</FieldLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aliases.map((a) => (
              <div
                key={a.from}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 16px 1fr 80px',
                  gap: 10,
                  alignItems: 'center',
                  fontFamily: TT_MONO,
                  fontSize: 11,
                  background: TT.bgAlt,
                  border: `1px solid ${TT.border}`,
                  padding: '8px 12px',
                }}
              >
                <span
                  style={{
                    color: TT.textMute,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={a.from}
                >
                  {a.from}
                </span>
                <span style={{ color: TT.green, textAlign: 'center' }}>→</span>
                <span
                  style={{
                    color: TT.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={a.to}
                >
                  {a.to}
                </span>
                <button
                  onClick={() => del.mutate(a.from)}
                  disabled={del.isPending}
                  style={smallBtn(TT.amber)}
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <FieldLabel>ADD ALIAS</FieldLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 16px 1fr',
          gap: 10,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={inputStyle}
        >
          <option value="">— from (old path) —</option>
          {candidates.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span style={{ color: TT.textDim, textAlign: 'center', fontFamily: TT_MONO }}>
          →
        </span>
        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={inputStyle}
        >
          <option value="">— to (canonical path) —</option>
          {candidates.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={submit} disabled={!canSubmit} style={primaryBtn(canSubmit)}>
          {upsert.isPending ? 'SAVING…' : 'MERGE'}
        </button>
        {error && (
          <span
            style={{ color: TT.amber, fontFamily: TT_MONO, fontSize: 11 }}
          >
            {error}
          </span>
        )}
        {upsert.isSuccess && !error && (
          <span style={{ color: TT.green, fontFamily: TT_MONO, fontSize: 11 }}>
            ✓ saved
          </span>
        )}
      </div>
    </TPanel>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: TT.bgAlt,
  border: `1px solid ${TT.border}`,
  padding: '8px 12px',
  color: TT.text,
  fontFamily: TT_MONO,
  fontSize: 11,
  outline: 'none',
  boxSizing: 'border-box',
};

function smallBtn(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${color}`,
    color,
    fontFamily: TT_MONO,
    fontSize: 10,
    padding: '4px 10px',
    cursor: 'pointer',
    letterSpacing: '0.06em',
  };
}

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    background: enabled ? TT.green : TT.bgAlt,
    border: `1px solid ${enabled ? TT.green : TT.border}`,
    color: enabled ? '#08090a' : TT.textDim,
    fontFamily: TT_MONO,
    fontSize: 11,
    fontWeight: 600,
    padding: '8px 22px',
    cursor: enabled ? 'pointer' : 'not-allowed',
    letterSpacing: '0.08em',
    opacity: enabled ? 1 : 0.6,
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: TT_MONO,
        fontSize: 9,
        color: TT.textDim,
        letterSpacing: '0.10em',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}
