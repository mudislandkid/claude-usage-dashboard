import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TT, TT_MONO } from './tokens';
import { useProjects } from '@/hooks/useProjects';
import { formatTokens, formatRelative } from '@/lib/format';

interface Item {
  type: 'nav' | 'project';
  label: string;
  sub?: string;
  shortcut?: string;
  action: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const { data: projects } = useProjects();

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const navItems: Item[] = [
      { type: 'nav', label: 'Go to Dashboard', shortcut: 'D', action: () => nav('/') },
      { type: 'nav', label: 'Go to Projects', shortcut: 'P', action: () => nav('/projects') },
      { type: 'nav', label: 'Go to Compare', shortcut: 'C', action: () => nav('/compare') },
      { type: 'nav', label: 'Go to Settings', shortcut: 'S', action: () => nav('/settings') },
    ];
    const projectItems: Item[] = (projects?.projects ?? []).map((p) => ({
      type: 'project',
      label: p.projectName,
      sub: `${formatTokens(p.totalTokens)} · ${formatRelative(p.lastTouched)}`,
      action: () => nav(`/projects/${encodeURIComponent(p.projectPath)}`),
    }));
    const all = [...navItems, ...projectItems];
    if (!q) return all.slice(0, 12);
    return all
      .filter((i) => i.label.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 12);
  }, [q, projects, nav]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[idx]) {
        items[idx].action();
        onClose();
      }
    }
  }

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8,9,10,0.72)',
        backdropFilter: 'blur(2px)',
        zIndex: 999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        animation: 'tt-fade-in 120ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600,
          maxWidth: 'calc(100% - 32px)',
          background: TT.bgAlt,
          border: `1px solid ${TT.borderHi}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            borderBottom: `1px solid ${TT.border}`,
          }}
        >
          <span style={{ color: TT.green, fontFamily: TT_MONO, fontSize: 14 }}>❯</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="search projects, jump to page…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: TT.text,
              fontFamily: TT_MONO,
              fontSize: 14,
            }}
          />
          <span
            style={{
              fontFamily: TT_MONO,
              fontSize: 9,
              color: TT.textDim,
              border: `1px solid ${TT.border}`,
              padding: '2px 6px',
            }}
          >
            ESC
          </span>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {items.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                fontFamily: TT_MONO,
                fontSize: 12,
                color: TT.textMute,
              }}
            >
              No matches
            </div>
          )}
          {items.map((it, i) => (
            <div
              key={i}
              onClick={() => {
                it.action();
                onClose();
              }}
              onMouseEnter={() => setIdx(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                fontFamily: TT_MONO,
                fontSize: 12,
                cursor: 'pointer',
                background: idx === i ? TT.greenSoft : 'transparent',
                borderLeft: idx === i ? `2px solid ${TT.green}` : '2px solid transparent',
                transition: 'background 80ms',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0, flex: 1 }}
              >
                <span
                  style={{
                    color: it.type === 'nav' ? TT.blue : TT.green,
                    fontSize: 9,
                    letterSpacing: '0.10em',
                    width: 50,
                    flexShrink: 0,
                  }}
                >
                  {it.type === 'nav' ? 'NAV →' : 'PROJ'}
                </span>
                <span
                  style={{
                    color: TT.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.label}
                </span>
                {it.sub && (
                  <span
                    style={{
                      color: TT.textMute,
                      fontSize: 10,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {it.sub}
                  </span>
                )}
              </div>
              {it.shortcut && (
                <span
                  style={{
                    fontFamily: TT_MONO,
                    fontSize: 9,
                    color: TT.textDim,
                    border: `1px solid ${TT.border}`,
                    padding: '2px 6px',
                    marginLeft: 8,
                  }}
                >
                  {it.shortcut}
                </span>
              )}
            </div>
          ))}
        </div>
        <div
          style={{
            padding: '8px 16px',
            borderTop: `1px solid ${TT.border}`,
            fontFamily: TT_MONO,
            fontSize: 9,
            color: TT.textDim,
            display: 'flex',
            gap: 16,
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>ESC close</span>
        </div>
      </div>
    </div>
  );
}
