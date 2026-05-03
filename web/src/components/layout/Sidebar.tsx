import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar() {
  return (
    <aside className="w-56 border-r border-border bg-card/40 flex flex-col">
      <div className="px-4 py-5 border-b border-border">
        <h1 className="font-semibold tracking-tight">Claude Usage</h1>
        <p className="text-xs text-muted-foreground">v0.1</p>
      </div>
      <nav className="flex-1 py-2">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-2 text-sm rounded-md mx-2 my-1 transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-accent',
                isActive && 'bg-accent text-foreground',
              )
            }
          >
            <it.icon className="size-4" />
            {it.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
