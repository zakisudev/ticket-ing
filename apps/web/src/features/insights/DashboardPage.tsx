import { Link, useParams } from 'react-router';
import {
  Archive,
  ArrowRight,
  CalendarCheck,
  Columns3,
  LayoutList,
  RotateCw,
  ShieldAlert,
} from 'lucide-react';
import type { TicketDto } from '@zakisu-tickets/shared';
import { useDashboard, useProjects } from '@/api/hooks';
import { BlockedBadge, LimitationsBadge, PriorityBadge, Spinner, TypeBadge } from '@/components/ui';

function CountTile({
  to,
  label,
  count,
  accent,
  testid,
}: {
  to: string;
  label: string;
  count: number;
  accent?: boolean;
  testid: string;
}) {
  return (
    <Link
      to={to}
      data-testid={testid}
      className={
        'flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ' +
        (accent
          ? 'border-danger/40 bg-danger/5 hover:bg-danger/10'
          : 'border-border bg-surface hover:bg-surface-2')
      }
    >
      <span className={'text-xs ' + (accent ? 'text-danger' : 'text-text-muted')}>{label}</span>
      <span className={'text-lg font-semibold tabular-nums ' + (accent ? 'text-danger' : '')}>
        {count}
      </span>
    </Link>
  );
}

function TicketRow({ ticket, slug }: { ticket: TicketDto; slug: string }) {
  return (
    <li>
      <Link
        to={`/p/${slug}/tickets/${ticket.id}`}
        className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2"
      >
        <span className="shrink-0 font-mono text-[10px] text-text-muted">{ticket.displayId}</span>
        <span className="min-w-0 truncate">{ticket.title}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {ticket.isBlocked ? <BlockedBadge reason={ticket.blockedReason} /> : null}
          {ticket.limitations ? <LimitationsBadge /> : null}
          <PriorityBadge priority={ticket.priority} />
          <TypeBadge type={ticket.type} />
        </span>
      </Link>
    </li>
  );
}

function TicketSection({
  title,
  icon,
  tickets,
  slug,
  empty,
  testid,
}: {
  title: string;
  icon: React.ReactNode;
  tickets: TicketDto[];
  slug: string;
  empty: string;
  testid: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-3" data-testid={testid}>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {icon} {title}
        <span className="rounded bg-surface-2 px-1.5 text-[10px] normal-case">{tickets.length}</span>
      </h2>
      {tickets.length === 0 ? (
        <p className="px-2 py-1 text-xs text-text-muted">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {tickets.map((t) => (
            <TicketRow key={t.id} ticket={t} slug={slug} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function DashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const projects = useProjects();
  const project = projects.data?.projects.find((p) => p.slug === slug);
  const dashboard = useDashboard(project?.id);

  if (projects.isLoading || dashboard.isLoading) return <Spinner />;
  if (!project || !dashboard.data) {
    return <div className="p-6 text-sm text-text-muted">Project not found.</div>;
  }

  const d = dashboard.data;
  const listBase = `/p/${project.slug}/list`;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">{project.name} dashboard</h1>
          <div className="text-[11px] text-text-muted">
            {project.projectKey} · what is the state of this project?
          </div>
        </div>
        <nav className="ml-auto flex items-center gap-3 text-xs">
          <Link to={`/p/${project.slug}/board`} className="flex items-center gap-1 text-text-muted hover:text-text">
            <Columns3 size={13} /> Board
          </Link>
          <Link to={listBase} className="flex items-center gap-1 text-text-muted hover:text-text">
            <LayoutList size={13} /> List
          </Link>
          <Link to={`/p/${project.slug}/focus`} className="flex items-center gap-1 text-text-muted hover:text-text">
            <ArrowRight size={13} /> Focus
          </Link>
        </nav>
      </header>

      <section aria-label="Ticket counts" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <CountTile to={`${listBase}?status=PLANNED`} label="Planned" count={d.counts.planned} testid="count-planned" />
        <CountTile to={`${listBase}?status=IN_PROGRESS`} label="In progress" count={d.counts.inProgress} testid="count-in-progress" />
        <CountTile to={`${listBase}?status=IMPLEMENTED`} label="Implemented" count={d.counts.implemented} testid="count-implemented" />
        <CountTile to={`${listBase}?status=TESTED`} label="Tested" count={d.counts.tested} testid="count-tested" />
        <CountTile to={`${listBase}?status=DEPLOYED`} label="Deployed" count={d.counts.deployed} testid="count-deployed" />
        <CountTile to={`${listBase}?blocked=true`} label="Blocked" count={d.counts.blocked} accent testid="count-blocked" />
      </section>
      <p className="-mt-2 text-[11px] text-text-muted">
        Blocked overlaps lifecycle counts — a ticket can be in progress <em>and</em> blocked.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <TicketSection
          title="Recently updated"
          icon={<RotateCw size={12} />}
          tickets={d.recentlyUpdated.slice(0, 6)}
          slug={project.slug}
          empty="No active tickets yet."
          testid="dash-recent-updated"
        />
        <TicketSection
          title="Recently deployed"
          icon={<CalendarCheck size={12} />}
          tickets={d.recentlyDeployed.slice(0, 6)}
          slug={project.slug}
          empty="Nothing deployed yet."
          testid="dash-recent-deployed"
        />
        <TicketSection
          title="Current blockers"
          icon={<ShieldAlert size={12} />}
          tickets={d.currentBlockers.slice(0, 6)}
          slug={project.slug}
          empty="Nothing is currently blocked."
          testid="dash-blockers"
        />
      </div>

      {project.archivedAt ? (
        <p className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-muted">
          <Archive size={12} /> This project is archived.
        </p>
      ) : null}
    </div>
  );
}
