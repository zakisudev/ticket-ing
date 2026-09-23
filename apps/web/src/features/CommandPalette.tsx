import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CalendarCheck,
  CircleDot,
  Columns3,
  FolderKanban,
  LayoutDashboard,
  LayoutList,
  Plus,
  Search,
  Ticket as TicketIcon,
} from 'lucide-react';
import type { TicketDto } from '@zakisu-tickets/shared';
import { api } from '@/api/client';
import { useProjects } from '@/api/hooks';
import { BlockedBadge, LimitationsBadge } from '@/components/ui';

export type PaletteMode = 'commands' | 'search';

export interface CommandPaletteHandle {
  openCommands: () => void;
  openSearch: () => void;
  close: () => void;
  isOpen: () => boolean;
}

interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Type-to-filter over a small static list — no virtualization needed at this scale. */
function filterActions(actions: PaletteAction[], query: string): PaletteAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return actions;
  return actions.filter(
    (a) => a.label.toLowerCase().includes(q) || (a.hint ?? '').toLowerCase().includes(q),
  );
}

export function useCommandPalette(): {
  open: boolean;
  mode: PaletteMode;
  setOpen: (open: boolean) => void;
  openCommands: () => void;
  openSearch: () => void;
} {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>('commands');

  // Global shortcuts: Ctrl/Cmd+K (commands), '/' (search). Suppressed while typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setMode('commands');
        setOpen(true);
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setMode('search');
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const openCommands = useCallback(() => {
    setMode('commands');
    setOpen(true);
  }, []);
  const openSearch = useCallback(() => {
    setMode('search');
    setOpen(true);
  }, []);
  return { open, mode, setOpen, openCommands, openSearch };
}

export function CommandPalette(props: {
  open: boolean;
  mode: PaletteMode;
  onClose: () => void;
  onSearch: () => void;
  onCreateTicket: () => void;
  onCreateProject: () => void;
  currentProject?: { id: string; slug: string; name: string; projectKey: string };
}) {
  const { open, mode, onClose, onSearch, onCreateTicket, onCreateProject, currentProject } = props;
  const navigate = useNavigate();
  const projects = useProjects();
  const [query, setQuery] = useState('');
  const [ticketResults, setTicketResults] = useState<TicketDto[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Reset transient state each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setTicketResults(null);
      setActiveIndex(0);
      // Focus after paint so the dialog is mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Ticket search (reuses the project search API — no second engine).
  useEffect(() => {
    if (!open || mode !== 'search') return;
    const q = query.trim();
    if (q.length < 2) {
      setTicketResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const searchIn = async (projectId: string | undefined) => {
          if (!projectId) return [];
          const res = await api.get<{ tickets: TicketDto[] }>(
            `/api/projects/${projectId}/search?q=${encodeURIComponent(q)}`,
          );
          return res.tickets;
        };
        let results: TicketDto[] = [];
        if (currentProject) {
          results = await searchIn(currentProject.id);
        } else {
          // Global palette search: query each project (small scale).
          const all = projects.data?.projects ?? [];
          const perProject = await Promise.all(all.slice(0, 12).map((p) => searchIn(p.id)));
          results = perProject.flat();
        }
        if (!cancelled) {
          setTicketResults(results.slice(0, 8));
          setSearching(false);
          setActiveIndex(0);
        }
      } catch {
        if (!cancelled) setSearching(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, mode, currentProject, projects.data]);

  const projectActions: PaletteAction[] = useMemo(() => {
    const list: PaletteAction[] = [];
    list.push({
      id: 'create-ticket',
      label: 'Create ticket',
      hint: currentProject ? `in ${currentProject.name}` : 'choose project',
      icon: <Plus size={13} />,
      run: () => {
        onClose();
        if (currentProject) onCreateTicket();
        else navigate('/projects');
      },
    });
    list.push({
      id: 'create-project',
      label: 'Create project',
      icon: <FolderKanban size={13} />,
      run: () => {
        onClose();
        onCreateProject();
      },
    });
    for (const p of projects.data?.projects ?? []) {
      list.push({
        id: `switch-${p.id}`,
        label: `Switch to ${p.name}`,
        hint: p.projectKey,
        icon: <FolderKanban size={13} />,
        run: () => {
          onClose();
          navigate(`/p/${p.slug}/dashboard`);
        },
      });
    }
    if (currentProject) {
      const base = `/p/${currentProject.slug}`;
      list.push(
        {
          id: 'go-board',
          label: 'Go to board',
          hint: currentProject.projectKey,
          icon: <Columns3 size={13} />,
          run: () => {
            onClose();
            navigate(`${base}/board`);
          },
        },
        {
          id: 'go-list',
          label: 'Go to list',
          icon: <LayoutList size={13} />,
          run: () => {
            onClose();
            navigate(`${base}/list`);
          },
        },
        {
          id: 'go-dashboard',
          label: 'Go to dashboard',
          icon: <LayoutDashboard size={13} />,
          run: () => {
            onClose();
            navigate(`${base}/dashboard`);
          },
        },
        {
          id: 'go-focus',
          label: 'Go to focus',
          icon: <CircleDot size={13} />,
          run: () => {
            onClose();
            navigate(`${base}/focus`);
          },
        },
        {
          id: 'go-accomplishments',
          label: 'Go to accomplishments',
          icon: <CalendarCheck size={13} />,
          run: () => {
            onClose();
            navigate(`${base}/accomplishments`);
          },
        },
        {
          id: 'search-tickets',
          label: 'Search tickets…',
          hint: 'type to search',
          icon: <Search size={13} />,
          run: () => {
            setQuery('');
            setTicketResults(null);
            setActiveIndex(0);
            onSearch();
          },
        },
      );
    } else {
      list.push(
        {
          id: 'go-focus-global',
          label: 'Go to focus (all projects)',
          icon: <CircleDot size={13} />,
          run: () => {
            onClose();
            navigate('/focus');
          },
        },
        {
          id: 'go-projects',
          label: 'Go to projects',
          icon: <LayoutList size={13} />,
          run: () => {
            onClose();
            navigate('/projects');
          },
        },
      );
    }
    return list;
  }, [projects.data, currentProject, navigate, onClose, onSearch, onCreateTicket, onCreateProject]);

  const filteredActions = useMemo(
    () => (mode === 'commands' ? filterActions(projectActions, query) : []),
    [mode, projectActions, query],
  );

  const flatItems = useMemo(() => {
    if (mode === 'commands') return filteredActions;
    return (ticketResults ?? []).map((t) => ({
      id: `ticket-${t.id}`,
      ticket: t,
    }));
  }, [mode, filteredActions, ticketResults]);

  useEffect(() => {
    if (activeIndex >= flatItems.length) setActiveIndex(Math.max(0, flatItems.length - 1));
  }, [flatItems.length, activeIndex]);

  const choose = (index: number) => {
    const item = flatItems[index];
    if (!item) return;
    if ('ticket' in item && item.ticket) {
      const t = item.ticket;
      onClose();
      const slug = projects.data?.projects.find((p) => p.id === t.projectId)?.slug ?? t.projectId;
      navigate(`/p/${slug}/tickets/${t.id}`);
      return;
    }
    (item as PaletteAction).run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(activeIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  const showCommands = mode === 'commands' || (mode === 'search' && query.trim().length < 2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="command-palette"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-[min(560px,92vw)] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search size={14} className="text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              mode === 'search' ? 'Search tickets… (TMR-042, title, notes)' : 'Type a command…'
            }
            className="w-full bg-transparent text-sm outline-none placeholder:text-text-muted"
            aria-label="Command palette input"
            data-testid="palette-input"
          />
          <kbd className="rounded border border-border px-1 font-mono text-[10px] text-text-muted">
            Esc
          </kbd>
        </div>

        <ul
          ref={listRef}
          className="max-h-[46vh] overflow-y-auto p-1.5 scroll-slim"
          data-testid="palette-results"
        >
          {showCommands ? (
            <>
              {filteredActions.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-text-muted">
                  No matching commands.
                </li>
              ) : (
                filteredActions.map((a, i) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => choose(i)}
                      className={
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ' +
                        (i === activeIndex
                          ? 'bg-accent-soft text-text'
                          : 'text-text-muted hover:bg-surface-2')
                      }
                    >
                      {a.icon}
                      <span className={i === activeIndex ? 'text-text' : ''}>{a.label}</span>
                      {a.hint ? (
                        <span className="ml-auto text-[10px] uppercase tracking-wide text-text-muted">
                          {a.hint}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </>
          ) : searching ? (
            <li className="px-3 py-6 text-center text-sm text-text-muted">Searching…</li>
          ) : (ticketResults ?? []).length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-muted">No tickets match.</li>
          ) : (
            (ticketResults ?? []).map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => choose(i)}
                  className={
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ' +
                    (i === activeIndex ? 'bg-accent-soft text-text' : 'hover:bg-surface-2')
                  }
                  data-testid={`palette-ticket-${t.displayId}`}
                >
                  <TicketIcon size={13} className="shrink-0 text-text-muted" />
                  <span className="shrink-0 font-mono text-[10px] text-text-muted">
                    {t.displayId}
                  </span>
                  <span className="min-w-0 truncate">{t.title}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {t.isBlocked ? <BlockedBadge reason={t.blockedReason} /> : null}
                    {t.limitations ? <LimitationsBadge /> : null}
                    <span className="text-[10px] uppercase tracking-wide text-text-muted">
                      {t.status.replace('_', ' ')}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-text-muted">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> select
          </span>
          <span>
            <kbd className="font-mono">esc</kbd> close
          </span>
          <span className="ml-auto">
            <kbd className="font-mono">/</kbd> search · <kbd className="font-mono">Ctrl K</kbd>{' '}
            commands
          </span>
        </div>
      </div>
    </div>
  );
}
