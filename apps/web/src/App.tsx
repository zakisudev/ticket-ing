import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { AuthLayout } from './features/auth/AuthLayout';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { HomePage } from './features/projects/HomePage';
import { AuthProvider } from './features/auth/AuthContext';
import { CommandPalette, useCommandPalette } from './features/CommandPalette';
import { useCreateProject, useCreateTicket, useProjects } from './api/hooks';
import { Dialog, Input, Textarea, Button } from './components/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { createProjectSchema } from '@zakisu-tickets/shared';

// Route-level code splitting: heavy/detail routes load on demand.
const BoardPage = lazy(() => import('./features/tickets/BoardPage').then((m) => ({ default: m.BoardPage })));
const ListPage = lazy(() => import('./features/tickets/ListPage').then((m) => ({ default: m.ListPage })));
const TicketDetailPage = lazy(() => import('./features/tickets/TicketDetailPage').then((m) => ({ default: m.TicketDetailPage })));
const DashboardPage = lazy(() => import('./features/insights/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ProjectFocusPage = lazy(() => import('./features/insights/FocusPage').then((m) => ({ default: m.ProjectFocusPage })));
const AccomplishmentsPage = lazy(() =>
  import('./features/insights/AccomplishmentsPage').then((m) => ({
    default: m.AccomplishmentsPage
  }))
);

function RouteLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="w-full max-w-3xl space-y-3 p-6">
        <div className="h-5 w-52 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
        </div>
      </div>
    </div>
  );
}

type ProjectFormValues = z.infer<typeof createProjectSchema>;

function CreateProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateProject();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ProjectFormValues>({ resolver: zodResolver(createProjectSchema) });

  const submit = handleSubmit(async (values) => {
    try {
      const { project } = await create.mutateAsync(values);
      reset();
      onClose();
      navigate(`/p/${project.slug}/dashboard`);
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Failed to create project'
      });
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title="Create project">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-text-muted" htmlFor="palette-project-name">
            Name
          </label>
          <Input id="palette-project-name" {...register('name')} data-testid="palette-project-name" />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted" htmlFor="palette-project-key">
            Project key
          </label>
          <Input
            id="palette-project-key"
            {...register('projectKey')}
            placeholder="TMR"
            className="uppercase"
            data-testid="palette-project-key"
          />
          {errors.projectKey ? <p className="mt-1 text-xs text-danger">{errors.projectKey.message}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted" htmlFor="palette-project-desc">
            Description (optional)
          </label>
          <Textarea id="palette-project-desc" rows={2} {...register('description')} />
        </div>
        {errors.root ? <p className="text-xs text-danger">{errors.root.message}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || create.isPending} data-testid="palette-project-submit">
            {create.isPending ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CreateTicketDialog({
  open,
  onClose,
  projectId,
  projectSlug,
  projectName
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectSlug: string;
  projectName: string;
}) {
  const create = useCreateTicket(projectId);
  const navigate = useNavigate();
  const [title, setTitle] = useState('');

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const { ticket } = await create.mutateAsync({ title: trimmed });
      setTitle('');
      onClose();
      navigate(`/p/${projectSlug}/tickets/${ticket.id}`);
    } catch {
      /* mutation error surfaced below */
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        setTitle('');
        onClose();
      }}
      title={`New ticket in ${projectName}`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3"
      >
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ticket title…"
          data-testid="palette-ticket-title"
        />
        <p className="text-[11px] text-text-muted">Created as PLANNED · P2 · FEATURE — refine after creating.</p>
        {create.isError ? <p className="text-xs text-danger">{create.error.message}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setTitle('');
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || title.trim().length === 0} data-testid="palette-ticket-submit">
            {create.isPending ? 'Creating…' : 'Create ticket'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Hosts the command palette and the dialogs its actions can trigger. */
function PaletteHost({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  // Which project are we in? Derived from the URL — single source of truth.
  const slug = useMemo(() => /^\/p\/([^/]+)/.exec(location.pathname)?.[1], [location.pathname]);
  const { data } = useProjects();
  const currentProject = data?.projects.find((p) => p.slug === slug);

  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const palette = useCommandPalette();

  const handleCreateTicket = useCallback(() => {
    // Never create into an arbitrary project: without one, go pick first.
    if (!currentProject) {
      return;
    }
    setCreateTicketOpen(true);
  }, [currentProject]);

  return (
    <>
      {children}
      <CommandPalette
        open={palette.open}
        mode={palette.mode}
        onClose={() => palette.setOpen(false)}
        onSearch={palette.openSearch}
        onCreateTicket={handleCreateTicket}
        onCreateProject={() => setCreateProjectOpen(true)}
        currentProject={
          currentProject
            ? {
                id: currentProject.id,
                slug: currentProject.slug,
                name: currentProject.name,
                projectKey: currentProject.projectKey
              }
            : undefined
        }
      />

      {currentProject ? (
        <CreateTicketDialog
          open={createTicketOpen}
          onClose={() => setCreateTicketOpen(false)}
          projectId={currentProject.id}
          projectSlug={currentProject.slug}
          projectName={currentProject.name}
        />
      ) : null}

      <CreateProjectDialog open={createProjectOpen} onClose={() => setCreateProjectOpen(false)} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route
            path="/p/:slug/*"
            element={
              <PaletteHost>
                <Suspense fallback={<RouteLoading />}>
                  <Routes>
                    <Route path="board" element={<BoardPage />} />
                    <Route path="list" element={<ListPage />} />
                    <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="focus" element={<ProjectFocusPage />} />
                    <Route path="accomplishments" element={<AccomplishmentsPage />} />
                    <Route path="*" element={<Navigate to="dashboard" replace />} />
                  </Routes>
                </Suspense>
              </PaletteHost>
            }
          />
          <Route
            path="/focus"
            element={
              <PaletteHost>
                <Suspense fallback={<RouteLoading />}>
                  <GlobalFocusPage />
                </Suspense>
              </PaletteHost>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

const GlobalFocusPage = lazy(() => import('./features/insights/FocusPage').then((m) => ({ default: m.GlobalFocusPage })));
