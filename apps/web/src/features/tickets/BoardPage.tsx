import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import type { TicketDto } from '@zakisu-tickets/shared';
import { useBoard, useCreateTicket, useMoveTicket, useProjects } from '@/api/hooks';
import { ApiClientError } from '@/api/client';
import { LAST_PROJECT_KEY } from '@/features/projects/HomePage';
import {
  BlockedBadge,
  Button,
  Input,
  LimitationsBadge,
  PriorityBadge,
  Spinner,
  TypeBadge,
} from '@/components/ui';
import { useQuickCreateShortcut } from '@/features/tickets/KeyboardShortcuts';

function Column({
  status,
  label,
  tickets,
  onOpenTicket,
}: {
  status: string;
  label: string;
  tickets: TicketDto[];
  onOpenTicket: (ticket: TicketDto) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</span>
        <span className="rounded bg-surface-2 px-1.5 text-[10px] text-text-muted">{tickets.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={
          'flex min-h-[120px] flex-1 flex-col gap-2 rounded-lg p-1.5 transition-colors ' +
          (isOver ? 'bg-accent-soft ring-1 ring-accent' : 'bg-surface-2/50')
        }
        data-testid={`board-column-${status}`}
      >
        {tickets.map((ticket) => (
          <BoardCard key={ticket.id} ticket={ticket} onOpenTicket={onOpenTicket} />
        ))}
      </div>
    </div>
  );
}

function BoardCard({ ticket, onOpenTicket }: { ticket: TicketDto; onOpenTicket: (t: TicketDto) => void }) {
  return (
    <button
      type="button"
      className="cursor-grab rounded-md border border-border bg-surface p-2.5 text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
      onClick={() => onOpenTicket(ticket)}
      data-testid={`ticket-card-${ticket.displayId}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-text-muted">{ticket.displayId}</span>
        <span className="ml-auto flex items-center gap-1">
          <PriorityBadge priority={ticket.priority} />
          <TypeBadge type={ticket.type} />
        </span>
      </div>
      <div className="mt-1.5 line-clamp-3 text-sm leading-snug">{ticket.title}</div>
      {ticket.isBlocked || ticket.limitations ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {ticket.isBlocked ? <BlockedBadge reason={ticket.blockedReason} /> : null}
          {ticket.limitations ? <LimitationsBadge /> : null}
        </div>
      ) : null}
    </button>
  );
}

function QuickCreate({ projectId, defaultStatus }: { projectId: string; defaultStatus?: string }) {
  const [title, setTitle] = useState('');
  const [open, setOpen] = useState(false);
  const create = useCreateTicket(projectId);
  useQuickCreateShortcut(!open, () => setOpen(true));

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ title: trimmed, status: defaultStatus });
      setTitle('');
      setOpen(false);
    } catch {
      /* error shown by mutation state below */
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpen(true)} data-testid="quick-create-open">
        <Plus size={13} /> Add ticket
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-1.5"
    >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ticket title…"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setTitle('');
          }
        }}
        data-testid="quick-create-input"
      />
      <div className="flex items-center gap-1.5">
        <Button type="submit" size="sm" disabled={create.isPending || title.trim().length === 0} data-testid="quick-create-submit">
          {create.isPending ? 'Adding…' : 'Add'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setTitle('');
          }}
        >
          Cancel
        </Button>
      </div>
      {create.isError ? <p className="text-xs text-danger">{create.error.message}</p> : null}
    </form>
  );
}

export function BoardPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const blockedOnly = searchParams.get('blocked') === 'true';
  const projects = useProjects();
  const project = useMemo(
    () => projects.data?.projects.find((p) => p.slug === slug),
    [projects.data, slug]
  );
  const board = useBoard(project?.id);
  const move = useMoveTicket(project?.id ?? '');
  const navigate = useNavigate();

  const [dragging, setDragging] = useState<TicketDto | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (project) {
      localStorage.setItem(LAST_PROJECT_KEY, project.slug);
    }
  }, [project]);

  useEffect(() => {
    setMoveError(null);
  }, [project?.id]);

  const columns = useMemo(() => {
    if (!board.data) return [];
    // Blocked-only quick filter: keep blocked cards, drop the rest.
    if (!blockedOnly) return board.data.board.columns;
    return board.data.board.columns.map((col) => ({
      ...col,
      tickets: col.tickets.filter((t) => t.isBlocked),
    }));
  }, [board.data, blockedOnly]);

  const onDragStart = (e: DragStartEvent) => {
    const ticketId = String(e.active.id);
    const ticket = columns.flatMap((c) => c.tickets).find((t) => t.id === ticketId);
    setDragging(ticket ?? null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const ticketId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId || !overId.startsWith('col:')) return;
    const targetStatus = overId.slice(4);

    const ticket = columns.flatMap((c) => c.tickets).find((t) => t.id === ticketId);
    if (!ticket || ticket.status === targetStatus) return;

    setMoveError(null);
    try {
      // Optimistic move + server persistence with rollback handled in the hook.
      await move.mutateAsync({ ticketId, version: ticket.version, status: targetStatus });
    } catch (err) {
      if (err instanceof ApiClientError && err.isStaleUpdate) {
        setMoveError('This ticket changed elsewhere — board refreshed.');
      } else if (err instanceof ApiClientError) {
        setMoveError(err.message);
      } else {
        setMoveError('Could not move the ticket. Board restored.');
      }
    }
  };

  if (projects.isLoading || board.isLoading) return <Spinner />;
  if (!project) {
    return <div className="p-6 text-sm text-text-muted">Project not found.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{project.name}</h1>
          <div className="text-[11px] text-text-muted">
            {project.projectKey} · {project.ticketCount} tickets
            {project.productionUrl ? ` · ${project.productionUrl}` : ''}
          </div>
        </div>
        {moveError ? (
          <p className="ml-auto rounded bg-danger/10 px-2 py-1 text-xs text-danger" role="alert" data-testid="board-error">
            {moveError}
          </p>
        ) : null}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-text-muted">
          <input
            type="checkbox"
            checked={blockedOnly}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams);
              if (e.target.checked) next.set('blocked', 'true');
              else next.delete('blocked');
              setSearchParams(next, { replace: true });
            }}
            data-testid="blocked-filter"
          />
          Blocked only
        </label>
      </header>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3 scroll-slim">
          {columns.map((col) => (
            <Column
              key={col.status}
              status={col.status}
              label={col.status.replace('_', ' ')}
              tickets={col.tickets}
              onOpenTicket={(t) => navigate(`/p/${project.slug}/tickets/${t.id}`)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div className="w-56 rotate-1 opacity-90">
              <div className="rounded-md border border-accent bg-surface p-2.5 shadow-xl">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-text-muted">{dragging.displayId}</span>
                  <span className="ml-auto"><PriorityBadge priority={dragging.priority} /></span>
                </div>
                <div className="mt-1.5 line-clamp-3 text-sm">{dragging.title}</div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="border-t border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-64">
            <QuickCreate projectId={project.id} />
          </div>
          <span className="text-[11px] text-text-muted">
            Tip: press <kbd className="rounded border border-border px-1 font-mono text-[10px]">C</kbd> to add a ticket
          </span>
        </div>
      </div>
    </div>
  );
}
