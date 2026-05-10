import { useEffect, useState, type ReactNode } from 'react';
import { TT, TT_MONO } from './tokens';
import { TSidebar } from './Sidebar';
import { TCommandBar } from './CommandBar';
import { TPageHeader } from './PageHeader';
import { CommandPalette } from './CommandPalette';
import { RangeProvider, useRange } from './RangeContext';

function Shell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { range, setRange } = useRange();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: TT.bg,
        color: TT.text,
        fontFamily: TT_MONO,
        display: 'flex',
      }}
    >
      <TSidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TCommandBar onOpenPalette={() => setPaletteOpen(true)} range={range} onRange={setRange} />
        <TPageHeader />
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export function TAppShell({ children }: { children: ReactNode }) {
  return (
    <RangeProvider>
      <Shell>{children}</Shell>
    </RangeProvider>
  );
}
