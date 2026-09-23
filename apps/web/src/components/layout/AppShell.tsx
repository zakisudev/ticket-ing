import { useContext, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { clsx } from 'clsx';
import {
  Archive,
  FolderKanban,
  KeyRound,
  LayoutList,
  LogOut,
  Menu,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { AuthContext } from '@/features/auth/AuthContext';
import { AuthProvider } from '@/features/auth/AuthContext';
import { useLogout, useProjects } from '@/api/hooks';
import { loadThemePreference, saveThemePreference, type ThemePreference } from '@/lib/theme';
import { Button } from '@/components/ui';

function ThemeToggle() {
  const [, setPref] = useState<ThemePreference>(() => loadThemePreference());
  const cycle = () => {
    const order: ThemePreference[] = ['dark', 'light', 'system'];
    const current = loadThemePreference();
    const next = order[(order.indexOf(current) + 1) % order.length];
    saveThemePreference(next);
    setPref(next);
  };
  return (
    <Button variant="ghost" size="sm" onClick={cycle} title={`Theme: ${loadThemePreference()} (click to cycle)`} aria-label="Cycle theme">
      <Sun size={13} className="hidden dark:block" />
      <Moon size={13} className="dark:hidden" />
    </Button>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useContext(AuthContext);
  const { data } = useProjects();
  const logout = useLogout();
  const navigate = useNavigate();
  const projects = data?.projects ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <FolderKanban size={16} className="text-accent" />
        <span className="text-sm font-bold tracking-tight">Zakisu Tickets</span>
      </div>

      <nav className="px-2 py-2" aria-label="Main">
        <NavLink
          to="/projects"
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
              isActive ? 'bg-accent-soft text-text font-medium' : 'text-text-muted hover:bg-surface-2 hover:text-text'
            )
          }
        >
          <LayoutList size={14} /> Projects
        </NavLink>
      </nav>

      <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Projects
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 scroll-slim" data-testid="sidebar-projects">
        {projects.map((p) => (
          <NavLink
            key={p.id}
            to={`/p/${p.slug}/board`}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                isActive ? 'bg-accent-soft font-medium text-text' : 'text-text-muted hover:bg-surface-2 hover:text-text'
              )
            }
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: p.color ?? 'var(--color-accent)' }}
            />
            <span className="truncate">{p.name}</span>
            <span className="ml-auto text-[10px] text-text-muted">{p.projectKey}</span>
          </NavLink>
        ))}
        {projects.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-text-muted">No projects yet</div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <div className="min-w-0 text-xs text-text-muted">
          <div className="truncate">{user?.name ?? user?.email}</div>
        </div>
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            aria-label="Log out"
            title="Log out"
            onClick={async () => {
              await logout.mutateAsync();
              navigate('/login');
            }}
          >
            <LogOut size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AuthProvider>
      <div className="flex h-full">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
          <SidebarContent />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-surface shadow-xl">
              <button
                className="absolute right-2 top-2 text-text-muted hover:text-text"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile topbar */}
          <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
            <button onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="text-text-muted hover:text-text">
              <Menu size={18} />
            </button>
            <Link to="/projects" className="text-sm font-bold tracking-tight">Zakisu Tickets</Link>
            <div className="ml-auto"><ThemeToggle /></div>
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto scroll-slim">
            <Outlet />
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}

export { Archive, KeyRound };
