import { useState } from 'react';
import { Link } from 'react-router';
import { Archive, ArchiveRestore, FolderKanban, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProjectSchema } from '@zakisu-tickets/shared';
import type { z } from 'zod';
import { useArchiveProject, useCreateProject, useProjects } from '@/api/hooks';
import { ApiClientError } from '@/api/client';
import { Button, Dialog, EmptyState, Input, Spinner, Textarea } from '@/components/ui';

type FormValues = z.infer<typeof createProjectSchema>;

function CreateProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateProject();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: '', projectKey: '', description: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
      reset();
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'VALIDATION_ERROR') {
        setError('root', { message: 'Check the highlighted fields.' });
      } else {
        setError('root', { message: err instanceof Error ? err.message : 'Failed to create project' });
      }
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title="Create project">
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div>
          <label htmlFor="proj-name" className="mb-1 block text-xs text-text-muted">Name</label>
          <Input id="proj-name" placeholder="TemariOne" data-testid="project-name" {...register('name')} />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>
        <div>
          <label htmlFor="proj-key" className="mb-1 block text-xs text-text-muted">
            Key (uppercase, 2–10 chars — used for ticket IDs like TMR-001)
          </label>
          <Input id="proj-key" placeholder="TMR" className="uppercase" data-testid="project-key" {...register('projectKey')} />
          {errors.projectKey ? <p className="mt-1 text-xs text-danger">{errors.projectKey.message}</p> : null}
        </div>
        <div>
          <label htmlFor="proj-desc" className="mb-1 block text-xs text-text-muted">Description (optional)</label>
          <Textarea id="proj-desc" rows={2} {...register('description')} />
        </div>
        {errors.root ? <p className="text-xs text-danger" role="alert">{errors.root.message}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting || create.isPending} data-testid="project-submit">
            {create.isPending ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ProjectsPage() {
  const { data, isLoading } = useProjects(true);
  const [createOpen, setCreateOpen] = useState(false);
  const archive = useArchiveProject();

  if (isLoading) return <Spinner />;

  const projects = data?.projects ?? [];
  const active = projects.filter((p) => !p.archived);
  const archivedList = projects.filter((p) => p.archived);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold">Projects</h1>
        <Button onClick={() => setCreateOpen(true)} data-testid="open-create-project">
          <Plus size={14} /> New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={28} />}
          title="Create your first project"
          hint="Each project gets its own board, numbering sequence, and ticket history."
          action={<Button onClick={() => setCreateOpen(true)}>Create project</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {active.map((p) => (
            <li key={p.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? 'var(--color-accent)' }} />
                <div className="min-w-0 flex-1">
                  <Link to={`/p/${p.slug}/board`} className="text-sm font-medium hover:text-accent" data-testid={`project-link-${p.slug}`}>
                    {p.name}
                  </Link>
                  <div className="mt-0.5 truncate text-xs text-text-muted">
                    {p.projectKey} · {p.ticketCount} ticket{p.ticketCount === 1 ? '' : 's'}
                    {p.productionUrl ? ` · ${p.productionUrl}` : ''}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Archive project"
                  aria-label={`Archive ${p.name}`}
                  onClick={() => archive.mutate({ projectId: p.id, archived: false })}
                >
                  <Archive size={14} />
                </Button>
              </div>
              {p.description ? <p className="mt-2 text-xs text-text-muted">{p.description}</p> : null}
            </li>
          ))}
        </ul>
      )}

      {archivedList.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Archived</h2>
          <ul className="space-y-2">
            {archivedList.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 p-3 opacity-75">
                <span className="min-w-0 flex-1 text-sm">
                  {p.name} <span className="text-xs text-text-muted">· {p.projectKey}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Unarchive project"
                  onClick={() => archive.mutate({ projectId: p.id, archived: true })}
                >
                  <ArchiveRestore size={14} />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <CreateProjectDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
