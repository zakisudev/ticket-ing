import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  History,
  Link2,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  displayTicketId,
  type ChecklistItemDto,
  type TicketLinkDto,
  type TicketStatus,
} from '@zakisu-tickets/shared';
import {
  useAddChecklistItem,
  useAddLink,
  useAddRelation,
  useArchiveTicket,
  useAttachTag,
  useCreateTag,
  useDeleteChecklistItem,
  useDeleteLink,
  useDeleteRelation,
  useDetachTag,
  usePatchTicket,
  useProjectTags,
  useProjects,
  useReorderChecklistItem,
  useTicket,
  useUpdateChecklistItem,
} from '@/api/hooks';
import type { TagDto } from '@zakisu-tickets/shared';
import { ApiClientError } from '@/api/client';
import { Markdown, shortCommitHash } from '@/components/Markdown';
import {
  BlockedBadge,
  Button,
  Input,
  LimitationsBadge,
  PriorityBadge,
  Select,
  Spinner,
  TagChip,
  Textarea,
  TypeBadge,
} from '@/components/ui';

const STATUSES: TicketStatus[] = [...TICKET_STATUSES];

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
  { key: 'description', label: 'Description', placeholder: 'Details, context, references… (Markdown supported)', rows: 8 },
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
      return metadata?.updated
        ? `Blocked reason updated — ${String(metadata?.reason ?? '')}`
        : `Blocked — ${String(metadata?.reason ?? 'reason recorded')}`;
    case 'UNBLOCKED': {
      const prev = metadata?.previousReason;
      return prev ? `Unblocked (previous reason: ${String(prev)})` : 'Unblocked';
    }
    case 'TICKET_ARCHIVED':
      return 'Ticket archived';
    case 'TICKET_RESTORED':
      return 'Ticket restored';
    case 'CHECKLIST_ITEM_ADDED':
      return 'Checklist item added';
    case 'CHECKLIST_ITEM_COMPLETED':
      return 'Checklist item completed';
    case 'CHECKLIST_ITEM_REOPENED':
      return 'Checklist item reopened';
    case 'CHECKLIST_ITEM_REMOVED':
      return 'Checklist item removed';
    case 'LINK_ADDED': {
      const label = metadata?.label ? String(metadata.label) : '';
      const short = shortCommitHash(label);
      const kind = metadata?.linkType === 'COMMIT' ? 'Commit' : 'Link';
      return `${kind} attached${short ? ` ${short}` : label ? ` — ${label}` : ''}`;
    }
    case 'LINK_REMOVED':
      return metadata?.linkType === 'COMMIT' ? 'Commit removed' : 'Link removed';
    case 'RELATION_ADDED':
      return `Relation added (${String(metadata?.relationType ?? '').replace('_', ' ').toLowerCase()})`;
    case 'RELATION_REMOVED':
      return 'Relation removed';
    case 'TAG_ADDED':
      return `Tag added: ${String(metadata?.tagSlug ?? '')}`;
    case 'TAG_REMOVED':
      return `Tag removed: ${String(metadata?.tagSlug ?? '')}`;
    default:
      return type;
  }
}

/** Collapsible section: empty sections collapse to a subtle Add affordance. */
function Section({
  label,
  empty,
  addLabel,
  onAdd,
  children,
  defaultOpen,
  accent,
}: {
  label: string;
  empty: boolean;
  addLabel?: string;
  onAdd?: () => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: 'warning';
}) {
  const [open, setOpen] = useState(defaultOpen ?? !empty);
  if (empty && !open) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-surface/40 px-3 py-2">
        <button
          type="button"
          className="flex w-full items-center justify-between text-xs text-text-muted hover:text-text"
          onClick={() => (onAdd ? (setOpen(true), onAdd()) : setOpen(true))}
        >
          <span>{addLabel ?? label}</span>
          <Plus size={12} />
        </button>
      </div>
    );
  }
  return (
    <section
      className={
        'rounded-lg border bg-surface p-3 ' +
        (accent === 'warning' ? 'border-warning/40' : 'border-border')
      }
    >
      <button
        type="button"
        className="mb-1.5 flex w-full items-center gap-1 text-left text-xs font-semibold text-text-muted hover:text-text"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
      </button>
      {open ? children : null}
    </section>
  );
}

/** One long field: edit textarea ↔ rendered Markdown preview toggle. */
function LongFieldSection({
  fieldKey,
  label,
  placeholder,
  rows,
  value,
  onChange,
  dirty,
}: {
  fieldKey: string;
  label: string;
  placeholder: string;
  rows: number;
  value: string;
  onChange: (next: string) => void;
  dirty: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const empty = value.trim().length === 0;
  return (
    <Section
      label={label}
      empty={empty && !dirty}
      addLabel={`Add ${label.toLowerCase()}`}
      accent={fieldKey === 'limitations' && !empty ? 'warning' : undefined}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={`field-${fieldKey}`} className="text-xs font-semibold text-text-muted">
          {label}
        </label>
        {!empty ? (
          <button
            type="button"
            className="text-[10px] text-text-muted hover:text-text"
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? 'Edit' : 'Preview'}
          </button>
        ) : null}
      </div>
      {preview && !empty ? (
        <Markdown text={value} testId={`field-preview-${fieldKey}`} />
      ) : (
        <Textarea
          id={`field-${fieldKey}`}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={`ticket-field-${fieldKey}`}
        />
      )}
    </Section>
  );
}

function Checklist({
  ticketId,
  items,
  projectId,
}: {
  ticketId: string;
  items: ChecklistItemDto[];
  projectId?: string;
}) {
  const add = useAddChecklistItem(projectId);
  const update = useUpdateChecklistItem(projectId);
  const remove = useDeleteChecklistItem(projectId);
  const reorder = useReorderChecklistItem(projectId);
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    add.mutate({ ticketId, text: trimmed });
    setText('');
  };

  const done = items.filter((i) => i.completed).length;

  return (
    <section className="rounded-lg border border-border bg-surface p-3" data-testid="checklist">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-muted">Checklist</h3>
        {items.length > 0 ? (
          <span className="text-[10px] text-text-muted">
            {done}/{items.length}
          </span>
        ) : null}
      </div>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={item.id} className="group flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.completed}
              onChange={(e) => update.mutate({ ticketId, itemId: item.id, patch: { completed: e.target.checked } })}
              aria-label={`Complete ${item.text}`}
              data-testid={`checklist-check-${index}`}
            />
            <span className={item.completed ? 'flex-1 text-text-muted line-through' : 'flex-1'}>
              {item.text}
            </span>
            <span className="hidden items-center gap-0.5 group-hover:flex">
              <button
                type="button"
                className="px-1 text-text-muted hover:text-text disabled:opacity-30"
                disabled={index === 0}
                onClick={() => reorder.mutate({ ticketId, itemId: item.id, direction: 'up' })}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                className="px-1 text-text-muted hover:text-text disabled:opacity-30"
                disabled={index === items.length - 1}
                onClick={() => reorder.mutate({ ticketId, itemId: item.id, direction: 'down' })}
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                className="px-1 text-text-muted hover:text-danger"
                onClick={() => remove.mutate({ ticketId, itemId: item.id })}
                aria-label="Delete item"
              >
                <Trash2 size={12} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add checklist item…"
          className="h-7 text-xs"
          data-testid="checklist-input"
        />
        <Button type="submit" size="sm" variant="ghost" disabled={!text.trim() || add.isPending}>
          <Plus size={12} />
        </Button>
      </form>
    </section>
  );
}

const LINK_TYPES = [
  'COMMIT',
  'PULL_REQUEST',
  'REPOSITORY',
  'DEPLOYMENT',
  'DOCUMENTATION',
  'ISSUE',
  'CHAT',
  'OTHER',
] as const;

function Links({
  ticketId,
  links,
  projectId,
}: {
  ticketId: string;
  links: TicketLinkDto[];
  projectId?: string;
}) {
  const add = useAddLink(projectId);
  const remove = useDeleteLink(projectId);
  const [type, setType] = useState<string>('COMMIT');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await add.mutateAsync({ ticketId, input: { type, label: label.trim() || null, url: url.trim() } });
      setLabel('');
      setUrl('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not add link');
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-3" data-testid="links">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-muted">
        <Link2 size={12} /> Links & commits
      </h3>
      <ul className="space-y-1.5">
        {links.map((link) => {
          const short = link.type === 'COMMIT' ? shortCommitHash(link.label) : null;
          return (
            <li key={link.id} className="group flex items-center gap-2 text-xs">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-muted">
                {link.type.replace('_', ' ')}
              </span>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className={
                  'truncate hover:text-accent ' +
                  (link.type === 'COMMIT' ? 'font-mono' : '')
                }
                data-testid={link.type === 'COMMIT' ? 'commit-link' : undefined}
              >
                {short ?? link.label ?? link.url}
              </a>
              <button
                type="button"
                className="ml-auto hidden text-text-muted hover:text-danger group-hover:block"
                onClick={() => remove.mutate({ ticketId, linkId: link.id })}
                aria-label="Remove link"
              >
                <Trash2 size={12} />
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-2 flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Select value={type} onChange={(e) => setType(e.target.value)} className="h-7 text-xs" aria-label="Link type">
          {LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </Select>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={type === 'COMMIT' ? 'Commit hash' : 'Label (optional)'}
          className="h-7 w-40 text-xs"
          data-testid="link-label"
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="h-7 w-52 text-xs"
          data-testid="link-url"
        />
        <Button type="submit" size="sm" variant="ghost" disabled={!url.trim() || add.isPending}>
          <Plus size={12} />
        </Button>
      </form>
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : null}
    </section>
  );
}

const RELATION_TYPES = ['BLOCKS', 'FOLLOWS_UP', 'RELATED_TO'] as const;

const RELATION_LABEL: Record<string, string> = {
  BLOCKS: 'Blocks',
  BLOCKED_BY: 'Blocked by',
  FOLLOWS_UP: 'Follow-up to',
  FOLLOWED_UP_BY: 'Followed up by',
  RELATED_TO: 'Related to',
};

function Relations({
  ticketId,
  relations,
  projectId,
  projectSlug,
}: {
  ticketId: string;
  relations: {
    id: string;
    type: string;
    otherTicketId: string;
    otherDisplayId: string;
    otherTitle: string;
    otherStatus: string;
  }[];
  projectId?: string;
  projectSlug: string;
}) {
  const add = useAddRelation(projectId);
  const remove = useDeleteRelation(projectId);
  const [type, setType] = useState<string>('BLOCKS');
  const [otherId, setOtherId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async () => {
    setError(null);
    try {
      await add.mutateAsync({ ticketId, input: { type, otherTicketId: otherId.trim() } });
      setOtherId('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not add relation');
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-3" data-testid="relations">
      <h3 className="mb-2 text-xs font-semibold text-text-muted">Relations</h3>
      {relations.length === 0 ? (
        <p className="mb-2 text-xs text-text-muted">No related tickets yet.</p>
      ) : (
        <ul className="space-y-1">
          {relations.map((rel) => (
            <li key={`${rel.id}-${rel.otherTicketId}`} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 text-text-muted">{RELATION_LABEL[rel.type] ?? rel.type}</span>
              <button
                type="button"
                className="truncate font-mono text-accent hover:underline"
                onClick={() => {
                  // Relations are same-project (V1 invariant); the list view is
                  // the quickest way to reach the other ticket.
                  navigate(`/p/${projectSlug}/list`);
                }}
                data-testid={`relation-${rel.type}`}
              >
                {rel.otherDisplayId}
              </button>
              <span className="truncate text-text-muted">{rel.otherTitle}</span>
              <button
                type="button"
                className="ml-auto hidden text-text-muted hover:text-danger group-hover:block"
                onClick={() => remove.mutate({ ticketId, relationId: rel.id })}
                aria-label="Remove relation"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Select value={type} onChange={(e) => setType(e.target.value)} className="h-7 text-xs" aria-label="Relation type">
          {RELATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </Select>
        <Input
          value={otherId}
          onChange={(e) => setOtherId(e.target.value)}
          placeholder="TMR-042 or ticket id…"
          className="h-7 w-44 text-xs"
          data-testid="relation-other"
        />
        <Button type="submit" size="sm" variant="ghost" disabled={!otherId.trim() || add.isPending}>
          <Plus size={12} />
        </Button>
      </form>
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : null}
    </section>
  );
}

function Tags({
  ticketId,
  tags,
  projectId,
}: {
  ticketId: string;
  tags: TagDto[];
  projectId?: string;
}) {
  const projectTags = useProjectTags(projectId);
  const createTag = useCreateTag(projectId ?? '');
  const attach = useAttachTag(projectId);
  const detach = useDetachTag(projectId);
  const [newTag, setNewTag] = useState('');

  const attachedIds = new Set(tags.map((t) => t.id));
  const available = (projectTags.data?.tags ?? []).filter((t) => !attachedIds.has(t.id));

  return (
    <section className="rounded-lg border border-border bg-surface p-3" data-testid="tags">
      <h3 className="mb-2 text-xs font-semibold text-text-muted">Tags</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <TagChip key={tag.id} tag={tag} onRemove={() => detach.mutate({ ticketId, tagId: tag.id })} />
        ))}
        {tags.length === 0 ? <span className="text-xs text-text-muted">No tags.</span> : null}
      </div>
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newTag.trim();
          if (!name) return;
          const existing = available.find(
            (t) => t.name.toLowerCase() === name.toLowerCase() || t.slug === name.toLowerCase()
          );
          if (existing) {
            attach.mutate({ ticketId, tagId: existing.id });
          } else {
            createTag.mutate(
              { name },
              {
                onSuccess: (data) => attach.mutate({ ticketId, tagId: data.tag.id }),
              }
            );
          }
          setNewTag('');
        }}
      >
        <Input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Add or create tag…"
          className="h-7 w-40 text-xs"
          data-testid="tag-input"
        />
        <Button type="submit" size="sm" variant="ghost" disabled={!newTag.trim()}>
          <Plus size={12} />
        </Button>
      </form>
    </section>
  );
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

  const save = async (
    extra?: {
      status?: string;
      priority?: string;
      type?: string;
      isBlocked?: boolean;
      blockedReason?: string | null;
    }
  ) => {
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
        setConflictMessage(
          'Newer version exists — this ticket was updated elsewhere. The latest server state has been loaded below; re-apply your edit.'
        );
        // Refetch latest data; do not overwrite server state.
        await detail.refetch();
        dirtyRef.current = false;
      } else {
        setSaveState('error');
      }
    }
  };

  const toggleBlocked = async (blocked: boolean) => {
    if (!ticket) return;
    if (blocked) {
      const reason = window.prompt('Blocking reason (required):');
      if (!reason || !reason.trim()) return;
      await save({ isBlocked: true, blockedReason: reason.trim() });
    } else {
      await save({ isBlocked: false });
    }
  };

  if (detail.isLoading || projects.isLoading) return <Spinner />;
  if (!ticket || !project) {
    return <div className="p-6 text-sm text-text-muted">Ticket not found.</div>;
  }

  const displayId = displayTicketId(project.projectKey, ticket.ticketNumber);
  const hasLimitations = Boolean(ticket.limitations && ticket.limitations.trim().length > 0);

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link to={`/p/${project.slug}/board`} className="flex items-center gap-1 text-xs text-text-muted hover:text-text">
          <ArrowLeft size={13} /> Board
        </Link>
        <Link to={`/p/${project.slug}/list`} className="flex items-center gap-1 text-xs text-text-muted hover:text-text">
          List
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
              {ticket.isBlocked ? <BlockedBadge reason={ticket.blockedReason} /> : null}
              {hasLimitations ? <LimitationsBadge /> : null}
              <PriorityBadge priority={ticket.priority} />
              <TypeBadge type={ticket.type} />
              <span>· created {fmtDate(ticket.createdAt)}</span>
              <span>· updated {fmtDate(ticket.updatedAt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              value={ticket.status}
              onChange={(e) => void save({ status: e.target.value })}
              aria-label="Status"
              data-testid="ticket-status"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </Select>
            <Select
              value={ticket.priority}
              onChange={(e) => void save({ priority: e.target.value })}
              aria-label="Priority"
              data-testid="ticket-priority"
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Select
              value={ticket.type}
              onChange={(e) => void save({ type: e.target.value })}
              aria-label="Type"
              data-testid="ticket-type"
            >
              {TICKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Save bar */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
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
          {conflictMessage ? (
            <span className="text-xs text-danger" data-testid="conflict-message">
              {conflictMessage}
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-1.5">
            {ticket.isBlocked ? (
              <Button variant="secondary" size="sm" onClick={() => void toggleBlocked(false)} data-testid="ticket-unblock">
                Unblock
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void toggleBlocked(true)} data-testid="ticket-block">
                <ShieldAlert size={13} /> Block
              </Button>
            )}
            {ticket.archivedAt ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => archive.mutate({ ticketId: ticket.id, archived: false })}
                data-testid="ticket-restore"
              >
                <ArchiveRestore size={13} /> Restore
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (window.confirm('Archive this ticket? It will disappear from the board.')) {
                    archive.mutate({ ticketId: ticket.id, archived: true });
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

        {ticket.isBlocked && ticket.blockedReason ? (
          <div className="mt-3 rounded-md border border-danger/40 bg-danger/5 p-2.5" data-testid="blocked-reason-box">
            <p className="text-xs font-semibold text-danger">Blocked</p>
            <p className="mt-0.5 text-sm">{ticket.blockedReason}</p>
          </div>
        ) : null}

        {ticket.status === 'DEPLOYED' && !(ticket.deploymentNotes ?? '').trim() ? (
          <p className="mt-3 text-xs text-text-muted" data-testid="deploy-notes-prompt">
            This ticket is deployed — consider adding deployment notes (how/where it shipped).
          </p>
        ) : null}
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Main engineering-memory fields */}
        <div className="space-y-3">
          {LONG_FIELDS.map((f) => (
            <LongFieldSection
              key={f.key}
              fieldKey={f.key}
              label={f.label}
              placeholder={f.placeholder}
              rows={f.rows}
              value={longs[f.key] ?? ''}
              onChange={(next) => {
                setLongs((prev) => ({ ...prev, [f.key]: next }));
                dirtyRef.current = true;
              }}
              dirty={(longs[f.key] ?? '') !== (ticket[f.key] ?? '')}
            />
          ))}
        </div>

        {/* Sidebar: memory tools */}
        <div className="space-y-3">
          <Checklist ticketId={ticket.id} items={ticket.checklist} projectId={project.id} />
          <Links ticketId={ticket.id} links={ticket.links} projectId={project.id} />
          <Relations
            ticketId={ticket.id}
            relations={ticket.relations}
            projectId={project.id}
            projectSlug={project.slug}
          />
          <Tags ticketId={ticket.id} tags={ticket.tags} projectId={project.id} />

          <section className="rounded-lg border border-border bg-surface p-3">
            <h3 className="mb-2 text-xs font-semibold text-text-muted">Milestones</h3>
            <dl className="space-y-1.5 text-xs">
              {(
                [
                  ['Created', ticket.createdAt],
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
