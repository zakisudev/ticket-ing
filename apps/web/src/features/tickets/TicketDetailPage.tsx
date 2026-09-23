import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Archive, ArchiveRestore, History } from 'lucide-react';
import { TICKET_PRIORITIES, TICKET_TYPES, displayTicketId } from '@zakisu-tickets/shared';
import type { TicketStatus } from '@zakisu-tickets/shared';
import { useArchiveTicket, usePatchTicket, useProjects, useTicket } from '@/api/hooks';
import { ApiClientError } from '@/api/client';
import { Button, Input, PriorityBadge, Select, Spinner, Textarea } from '@/components/ui';

const STATUSES: TicketStatus[] = [
  'PLANNED',
  'IN_PROGRESS',
  'IMPLEMENTED',
  'TESTED',
  'DEPLOYED',
  'BLOCKED',
  'ARCHIVED',
];

type LongField =
  | 'summary'
  | 'description'
  | 'motivation'
  | 'acceptanceCriteria'
  | 'implementationNotes'
  | 'testingNotes'
  | 'deploymentNotes'
  | 'limitations'
  | 'knownIssues'
  | 'followUpNotes';

const LONG_FIELDS: { key: LongField; label: string; placeholder: string; rows: number }[] = [
  { key: 'summary', label: 'Summary', placeholder: 'One-line summary', rows: 2 },
  { key: 'motivation', label: 'Why', placeholder: 'Why does this ticket exist?', rows: 3 },
  { key: 'description', label: 'Description', placeholder: 'Details, context, references…', rows: 8 },
  { key: 'acceptanceCriteria', label: 'Acceptance Criteria', placeholder: 'What must be true to call this done?', rows: 5 },
  { key: 'implementationNotes', label: 'Implementation', placeholder: 'Implementation notes…', rows: 5 },
  { key: 'testingNotes', label: 'Testing', placeholder: 'Test notes…', rows: 4 },
  { key: 'deploymentNotes', label: 'Deployment', placeholder: 'Deployment notes…', rows: 4 },
  { key: 'limitations', label: 'Limitations', placeholder: 'Known limitations of this implementation…', rows: 4 },
  { key: 'knownIssues', label: 'Known Issues', placeholder: 'Known issues…', rows: 4 },
  { key: 'followUpNotes', label: 'Follow-ups', placeholder: 'Follow-up work…', rows: 4 },
];

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function humanizeActivity(type: string, metadata: Record<string, unknown> | null): string {
  switch (type) {
    case 'TICKET_CREATED':
      return 'Ticket created';
    case 'STATUS_CHANGED': {
      const from = String(metadata?.from ?? '?').replace('_', ' ');
      const to = String(metadata?.to ?? '?').replace('_', ' ');
      return `Status: ${from} → ${to}`;
    }
    case 'PRIORITY_CHANGED':
      return `Priority: ${String(metadata?.from ?? '?')} → ${String(metadata?.to ?? '?')}`;
    case 'TYPE_CHANGED':
      return `Type: ${String(metadata?.from ?? '?')} → ${String(metadata?.to ?? '?')}`;
    case 'TITLE_CHANGED':
      return `Title changed to “${String(metadata?.to ?? '')}”`;
    case 'FIELDS_UPDATED': {
      const fields = Array.isArray(metadata?.fields) ? (metadata?.fields as string[]) : [];
      return fields.length > 0 ? `Updated ${fields.join(', ')}` : 'Fields updated';
    }
    case 'BLOCKED':
      return `Blocked — ${String(metadata?.reason ?? 'reason recorded')}`;
    case 'UNBLOCKED':
      return `Unblocked (previous reason: ${String(metadata?.previousReason ?? 'none')})`;
    case 'TICKET_ARCHIVED':
      return 'Ticket archived';
    case 'TICKET_RESTORED':
      return 'Ticket restored';
    default:
      return type;
  }
}

export function TicketDetailPage() {
  const { slug, ticketId } = useParams<{ slug: string; ticketId: string }>();
  const navigate = useNavigate();
  const projects = useProjects();
  const project = useMemo(() => projects.data?.projects.find((p) => p.slug === slug), [projects.data, slug]);
  const detail = useTicket(ticketId);
  const patch = usePatchTicket(ticketId ?? '');
  const archive = useArchiveTicket();

  const ticket = detail.data?.ticket;
  const [title, setTitle] = useState('');
  const [longs, setLongs] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  // Hydrate local edit state when a fresh ticket arrives and we have no local edits.
  useEffect(() => {
    if (!ticket) return;
    if (dirtyRef.current) return;
    setTitle(ticket.title);
    setLongs(Object.fromEntries(LONG_FIELDS.map((f) => [f.key, ticket[f.key] ?? ''])));
  }, [ticket]);

  const currentVersion = ticket?.version ?? 0;

  const save = async (extra?: { status?: string; priority?: string; type?: string; blockedReason?: string | null }) => {
    if (!ticket) return;
    setSaveState('saving');
    setConflictMessage(null);
    const body: Record<string, unknown> = { version: currentVersion };
    if (title.trim() && title !== ticket.title) body.title = title.trim();
    for (const f of LONG_FIELDS) {
      const next = longs[f.key] ?? '';
      if (next !== (ticket[f.key] ?? '')) {
        body[f.key] = next === '' ? null : next;
      }
    }
    Object.assign(body, extra);

    try {
      await patch.mutateAsync(body as never);
      dirtyRef.current = false;
      setSaveState('saved');
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (err) {
      if (err instanceof ApiClientError && err.isStaleUpdate) {
        setSaveState('conflict');
        setConflictMessage('Newer version exists — this ticket was updated elsewhere. Review below and re-apply your edit.');
      } else {
        setSaveState('error');
      }
    }
  };

  const changeStatus = async (status: string) => {
    if (!ticket) return;
    if (status === 'BLOCKED' && ticket.status !== 'BLOCKED') {
      const reason = window.prompt('Blocking reason (required):');
      if (!reason || !reason.trim()) return;
      await save({ status, blockedReason: reason.trim() });
      return;
    }
    await save({ status });
  };

  if (detail.isLoading || projects.isLoading) return <Spinner />;
  if (!ticket || !project) {
    return <div className="p-6 text-sm text-text-muted">Ticket not found.</div>;
  }

  const displayId = displayTicketId(project.projectKey, ticket.ticketNumber);
  const isBlocked = ticket.status === 'BLOCKED';

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link to={`/p/${project.slug}/board`} className="flex items-center gap-1 text-xs text-text-muted hover:text-text">
          <ArrowLeft size={13} /> Board
        </Link>
        <span className="ml-auto font-mono text-xs text-text-muted">{displayId}</span>
      </div>

      <header className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                dirtyRef.current = true;
              }}
              className="!h-9 border-transparent bg-transparent !text-base font-semibold hover:border-border focus:border-accent"
              aria-label="Ticket title"
              data-testid="ticket-title-input"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
              <span>{ticket.status.replace('_', ' ')}</span>
              <PriorityBadge priority={ticket.priority} />
              <span>· created {fmtDate(ticket.createdAt)}</span>
              <span>· updated {fmtDate(ticket.updatedAt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              value={ticket.status}
              onChange={(e) => void changeStatus(e.target.value)}
              aria-label="Status"
              data-testid="ticket-status"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </Select>
            <Select
              value={ticket.priority}
              onChange={(e) => void save({ priority: e.target.value })}
              aria-label="Priority"
              data-testid="ticket-priority"
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
            <Select
              value={ticket.type}
              onChange={(e) => void save({ type: e.target.value })}
              aria-label="Type"
              data-testid="ticket-type"
            >
              {TICKET_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        </div>

        {/* Save bar */}
        <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
          <Button onClick={() => void save()} disabled={saveState === 'saving'} data-testid="ticket-save">
            Save
          </Button>
          <span
            className={
              'text-xs ' +
              (saveState === 'error' || saveState === 'conflict'
                ? 'text-danger'
                : saveState === 'saved'
                  ? 'text-success'
                  : 'text-text-muted')
            }
            data-testid="ticket-save-state"
            role={saveState === 'conflict' || saveState === 'error' ? 'alert' : undefined}
          >
            {saveState === 'saving' && 'Saving…'}
            {saveState === 'saved' && 'Saved'}
            {saveState === 'error' && 'Save failed — check connection and retry'}
            {saveState === 'conflict' && 'Newer version exists'}
            {saveState === 'idle' && `v${currentVersion}`}
          </span>
          {conflictMessage ? <span className="text-xs text-danger">{conflictMessage}</span> : null}

          <div className="ml-auto">
            {ticket.archivedAt ? (
              <Button variant="secondary" size="sm" onClick={() => archive.mutate({ ticketId: ticket.id, archived: true })}>
                <ArchiveRestore size={13} /> Restore
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (window.confirm('Archive this ticket? It will disappear from the board.')) {
                    archive.mutate({ ticketId: ticket.id, archived: false });
                    navigate(`/p/${project.slug}/board`);
                  }
                }}
                data-testid="ticket-archive"
              >
                <Archive size={13} /> Archive
              </Button>
            )}
          </div>
        </div>

        {isBlocked ? (
          <div className="mt-3 rounded-md border border-danger/40 bg-danger/5 p-2.5">
            <label htmlFor="blocked-reason" className="mb-1 block text-xs font-semibold text-danger">
              Blocked — reason
            </label>
            <Input
              id="blocked-reason"
              value={longs.blockedLiveOverride ?? ticket.blockedReason ?? ''}
              onChange={(e) => setLongs((prev) => ({ ...prev, blockedLiveOverride: e.target.value }))}
              onBlur={() => void save({ blockedReason: longs.blockedLiveOverride ?? null })}
              data-testid="ticket-blocked-reason"
            />
          </div>
        ) : null}
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
        {/* Main fields */}
        <div className="space-y-3">
          {LONG_FIELDS.map((f) => (
            <section key={f.key} className="rounded-lg border border-border bg-surface p-3">
              <label htmlFor={`field-${f.key}`} className="mb-1.5 block text-xs font-semibold text-text-muted">
                {f.label}
              </label>
              <Textarea
                id={`field-${f.key}`}
                rows={f.rows}
                placeholder={f.placeholder}
                value={longs[f.key] ?? ''}
                onChange={(e) => {
                  setLongs((prev) => ({ ...prev, [f.key]: e.target.value }));
                  dirtyRef.current = true;
                }}
                data-testid={`ticket-field-${f.key}`}
              />
            </section>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <section className="rounded-lg border border-border bg-surface p-3">
            <h3 className="mb-2 text-xs font-semibold text-text-muted">Milestones</h3>
            <dl className="space-y-1.5 text-xs">
              {(
                [
                  ['Started', ticket.startedAt],
                  ['Implemented', ticket.implementedAt],
                  ['Tested', ticket.testedAt],
                  ['Deployed', ticket.deployedAt],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <dt className="text-text-muted">{label}</dt>
                  <dd className={value ? 'text-text' : 'text-text-muted/50'}>{fmtDate(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[10px] leading-relaxed text-text-muted">
              Milestones record the first time a ticket reached each state and are never erased by moving backward.
            </p>
          </section>

          <section className="rounded-lg border border-border bg-surface p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-muted">
              <History size={12} /> Activity
            </h3>
            {ticket.activity.length === 0 ? (
              <p className="text-xs text-text-muted">No activity yet.</p>
            ) : (
              <ol className="space-y-2" data-testid="ticket-activity">
                {ticket.activity.map((a) => (
                  <li key={a.id} className="text-xs">
                    <div>{humanizeActivity(a.type, a.metadata)}</div>
                    <div className="text-[10px] text-text-muted">{fmtDate(a.createdAt)}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
