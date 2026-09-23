import { useNavigate, useParams } from 'react-router';
import { CalendarCheck } from 'lucide-react';
import type { AccomplishmentsDto, TicketDto } from '@zakisu-tickets/shared';
import { useAccomplishments, useProjects } from '@/api/hooks';
import { LimitationsBadge, Spinner, TypeBadge } from '@/components/ui';

function AccomplishmentRow({ ticket, slug }: { ticket: TicketDto; slug: string }) {
  const navigate = useNavigate();
  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/p/${slug}/tickets/${ticket.id}`)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
        data-testid={`accomplishment-${ticket.displayId}`}
      >
        <span aria-hidden className="text-success">✓</span>
        <span className="shrink-0 font-mono text-[10px] text-text-muted">{ticket.displayId}</span>
        <span className="min-w-0 truncate">{ticket.title}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {ticket.limitations ? <LimitationsBadge /> : null}
          <TypeBadge type={ticket.type} />
          <span className="w-16 text-right text-[10px] text-text-muted">
            {ticket.deployedAt
              ? new Date(ticket.deployedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : '—'}
          </span>
        </span>
      </button>
    </li>
  );
}

function AccomplishmentsBody({ projectId, slug }: { projectId: string; slug: string }) {
  const accomplishments = useAccomplishments(projectId);

  if (accomplishments.isLoading) return <Spinner />;
  if (!accomplishments.data) {
    return <div className="p-6 text-sm text-text-muted">Could not load accomplishments.</div>;
  }

  const { groups } = accomplishments.data as AccomplishmentsDto;
  const total = groups.reduce((sum, g) => sum + g.tickets.length, 0);
  const dataIssues = groups.flatMap((g) => g.dataIssues);

  return (
    <div className="space-y-4" data-testid="accomplishments-page">
      {total === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border py-14 text-center text-sm text-text-muted">
          <CalendarCheck size={20} />
          No deployed tickets yet.
          <span className="text-xs">Deployed work will appear here, grouped by when it shipped.</span>
        </div>
      ) : (
        groups.map((group) =>
          group.tickets.length === 0 ? null : (
            <section
              key={group.key}
              className="rounded-lg border border-border bg-surface p-3"
              data-testid={`accomplishments-${group.key}`}
            >
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                <CalendarCheck size={12} /> {group.label}
                <span className="rounded bg-surface-2 px-1.5 text-[10px] normal-case">
                  {group.tickets.length}
                </span>
              </h2>
              <ul className="space-y-0.5">
                {group.tickets.map((t) => (
                  <AccomplishmentRow key={t.id} ticket={t} slug={slug} />
                ))}
              </ul>
            </section>
          )
        )
      )}

      {dataIssues.length > 0 ? (
        <section className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
          <h2 className="mb-1 font-semibold">Data issues</h2>
          <ul className="list-inside list-disc space-y-0.5">
            {dataIssues.map((issue) => (
              <li key={issue.ticketId}>
                {issue.displayId}: {issue.issue}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Project accomplishments route: /p/:slug/accomplishments */
export function AccomplishmentsPage() {
  const { slug } = useParams<{ slug: string }>();
  const projects = useProjects();
  const project = projects.data?.projects.find((p) => p.slug === slug);

  if (projects.isLoading) return <Spinner />;
  if (!project) return <div className="p-6 text-sm text-text-muted">Project not found.</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header>
        <h1 className="text-base font-semibold">{project.name} accomplishments</h1>
        <div className="text-[11px] text-text-muted">
          What have we actually shipped? Grouped by deployment date.
        </div>
      </header>
      <AccomplishmentsBody projectId={project.id} slug={project.slug} />
    </div>
  );
}
