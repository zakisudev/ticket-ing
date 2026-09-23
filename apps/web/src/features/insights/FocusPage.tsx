import { Link, useParams } from 'react-router';
import { CircleDot, FlaskConical, Rocket, ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';
import type { FocusGroupKey, TicketDto } from '@zakisu-tickets/shared';
import { useFocus, useProjects } from '@/api/hooks';
import { BlockedBadge, LimitationsBadge, PriorityBadge, Spinner, TypeBadge } from '@/components/ui';

const GROUP_META: Record<FocusGroupKey, { title: string; hint: string; icon: React.ReactNode }> = {
  in_progress: {
    title: 'In progress',
    hint: 'Work currently underway.',
    icon: <CircleDot size={12} />,
  },
  blocked: {
    title: 'Blocked',
    hint: 'Work that cannot continue right now.',
    icon: <ShieldAlert size={12} />,
  },
  implemented_awaiting_test: {
    title: 'Implemented, awaiting testing',
    hint: 'Code is done — verification has not passed yet.',
    icon: <FlaskConical size={12} />,
  },
  tested_awaiting_deploy: {
    title: 'Tested, awaiting deployment',
    hint: 'Verified — ready to ship.',
    icon: <Rocket size={12} />,
  },
};

function FocusTicket({ ticket, projectSlug }: { ticket: TicketDto; projectSlug?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
      {projectSlug ? (
        <Link
          to={`/p/${projectSlug}/tickets/${ticket.id}`}
          className="min-w-0 flex-1"
          data-testid={`focus-ticket-${ticket.displayId}`}
        >
          <span className="mr-2 font-mono text-[10px] text-text-muted">{ticket.displayId}</span>
          <span>{ticket.title}</span>
        </Link>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="mr-2 font-mono text-[10px] text-text-muted">{ticket.displayId}</span>
          <span>{ticket.title}</span>
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {ticket.isBlocked ? <BlockedBadge reason={ticket.blockedReason} /> : null}
        {ticket.limitations ? <LimitationsBadge /> : null}
        <PriorityBadge priority={ticket.priority} />
        <TypeBadge type={ticket.type} />
      </span>
    </div>
  );
}

function FocusGroups({ projectId }: { projectId: string | null }) {
  const focus = useFocus(projectId);
  const projects = useProjects();

  // projectId → slug map so global focus can link straight to tickets.
  const slugByProjectId = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects.data?.projects ?? []) map.set(p.id, p.slug);
    return map;
  }, [projects.data]);

  if (focus.isLoading) return <Spinner />;
  if (!focus.data) {
    return <div className="p-6 text-sm text-text-muted">Could not load focus data.</div>;
  }

  const isGlobal = projectId === null;

  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="focus-page">
      {focus.data.groups.map((group) => {
        const meta = GROUP_META[group.key];
        return (
          <section
            key={group.key}
            className="rounded-lg border border-border bg-surface p-3"
            data-testid={`focus-${group.key}`}
          >
            <h2 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
              {meta.icon} {meta.title}
              <span className="rounded bg-surface-2 px-1.5 text-[10px] normal-case">
                {group.tickets.length}
              </span>
            </h2>
            <p className="mb-2 text-[11px] text-text-muted">{meta.hint}</p>
            {group.tickets.length === 0 ? (
              <p className="px-2 py-1 text-xs text-text-muted">
                {group.key === 'blocked'
                  ? 'Nothing is currently blocked.'
                  : group.key === 'tested_awaiting_deploy'
                    ? 'Nothing is waiting for deployment.'
                    : 'Nothing here right now.'}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {group.tickets.map((t) => (
                  <li key={t.id}>
                    {isGlobal ? (
                      <div className="mb-0.5 ml-2 text-[10px] uppercase tracking-wide text-text-muted">
                        <Link
                          to={`/p/${slugByProjectId.get(t.projectId)}/board`}
                          className="hover:text-text"
                        >
                          {t.projectKey}
                        </Link>
                      </div>
                    ) : null}
                    <FocusTicket ticket={t} projectSlug={slugByProjectId.get(t.projectId)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Project focus route: /p/:slug/focus */
export function ProjectFocusPage() {
  const { slug } = useParams<{ slug: string }>();
  const projects = useProjects();
  const project = projects.data?.projects.find((p) => p.slug === slug);
  if (projects.isLoading) return <Spinner />;
  if (!project) return <div className="p-6 text-sm text-text-muted">Project not found.</div>;
  return <FocusGroups projectId={project.id} />;
}

/** Global focus route: /focus — across all projects, with project identity. */
export function GlobalFocusPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header>
        <h1 className="text-base font-semibold">Focus</h1>
        <div className="text-[11px] text-text-muted">
          What needs my attention, across every project?
        </div>
      </header>
      <FocusGroups projectId={null} />
    </div>
  );
}
