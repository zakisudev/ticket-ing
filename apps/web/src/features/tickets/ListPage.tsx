import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  type ListSortField,
  type TicketFilterParams,
} from '@zakisu-tickets/shared';
import { Columns3, Inbox } from 'lucide-react';
import { useProjectTags, useProjects, useTicketList } from '@/api/hooks';
import {
  BlockedBadge,
  Input,
  LimitationsBadge,
  PriorityBadge,
  Select,
  Spinner,
  TypeBadge,
} from '@/components/ui';

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Reads filters from URL search params (shared convention with the board). */
export function parseFilters(searchParams: URLSearchParams): TicketFilterParams {
  const pick = (key: string) => searchParams.get(key) ?? undefined;
  const flag = (key: string) => {
    const v = pick(key);
    return v === 'true' || v === 'false' ? v : undefined;
  };
  return {
    status: pick('status') as TicketFilterParams['status'],
    priority: pick('priority') as TicketFilterParams['priority'],
    type: pick('type') as TicketFilterParams['type'],
    tag: pick('tag'),
    blocked: flag('blocked'),
    hasLimitations: flag('hasLimitations'),
    hasKnownIssues: flag('hasKnownIssues'),
    hasFollowUps: flag('hasFollowUps'),
    q: pick('q'),
    archived: pick('archived') === 'only' ? 'only' : undefined,
  };
}

function setParam(searchParams: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  if (value === null || value === '') next.delete(key);
  else next.set(key, value);
  return next;
}

function FilterBar({
  searchParams,
  setSearchParams,
  tags,
}: {
  searchParams: URLSearchParams;
  setSearchParams: (next: URLSearchParams) => void;
  tags: { slug: string; name: string }[];
}) {
  const activeCount = ['status', 'priority', 'type', 'tag', 'blocked', 'hasLimitations', 'hasKnownIssues', 'hasFollowUps', 'q', 'archived']
    .filter((k) => searchParams.get(k))
    .length;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="list-filters">
      <Input
        value={searchParams.get('q') ?? ''}
        onChange={(e) => setSearchParams(setParam(searchParams, 'q', e.target.value))}
        placeholder="Search… (number, title, notes)"
        className="h-7 w-52 text-xs"
        data-testid="filter-q"
      />
      <Select
        value={searchParams.get('status') ?? ''}
        onChange={(e) => setSearchParams(setParam(searchParams, 'status', e.target.value))}
        className="h-7 text-xs"
        aria-label="Filter by status"
        data-testid="filter-status"
      >
        <option value="">Any status</option>
        {TICKET_STATUSES.map((s) => (
          <option key={s} value={s}>{s.replace('_', ' ')}</option>
        ))}
      </Select>
      <Select
        value={searchParams.get('priority') ?? ''}
        onChange={(e) => setSearchParams(setParam(searchParams, 'priority', e.target.value))}
        className="h-7 text-xs"
        aria-label="Filter by priority"
      >
        <option value="">Any priority</option>
        {TICKET_PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </Select>
      <Select
        value={searchParams.get('type') ?? ''}
        onChange={(e) => setSearchParams(setParam(searchParams, 'type', e.target.value))}
        className="h-7 text-xs"
        aria-label="Filter by type"
      >
        <option value="">Any type</option>
        {TICKET_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </Select>
      <Select
        value={searchParams.get('tag') ?? ''}
        onChange={(e) => setSearchParams(setParam(searchParams, 'tag', e.target.value))}
        className="h-7 text-xs"
        aria-label="Filter by tag"
      >
        <option value="">Any tag</option>
        {tags.map((t) => (
          <option key={t.slug} value={t.slug}>{t.name}</option>
        ))}
      </Select>
      <label className="flex cursor-pointer items-center gap-1 text-[11px] text-text-muted">
        <input
          type="checkbox"
          checked={searchParams.get('blocked') === 'true'}
          onChange={(e) => setSearchParams(setParam(searchParams, 'blocked', e.target.checked ? 'true' : null))}
          data-testid="filter-blocked"
        />
        Blocked
      </label>
      <label className="flex cursor-pointer items-center gap-1 text-[11px] text-text-muted">
        <input
          type="checkbox"
          checked={searchParams.get('hasLimitations') === 'true'}
          onChange={(e) =>
            setSearchParams(setParam(searchParams, 'hasLimitations', e.target.checked ? 'true' : null))
          }
        />
        Has limitations
      </label>
      <Select
        value={searchParams.get('archived') === 'only' ? 'only' : ''}
        onChange={(e) => setSearchParams(setParam(searchParams, 'archived', e.target.value === 'only' ? 'only' : null))}
        className="h-7 text-xs"
        aria-label="Archived view"
      >
        <option value="">Active</option>
        <option value="only">Archived only</option>
      </Select>
      {activeCount > 0 ? (
        <button
          type="button"
          className="text-[11px] text-accent hover:underline"
          onClick={() => setSearchParams(new URLSearchParams())}
        >
          Clear all ({activeCount})
        </button>
      ) : null}
    </div>
  );
}

export function ListPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projects = useProjects();
  const project = useMemo(
    () => projects.data?.projects.find((p) => p.slug === slug),
    [projects.data, slug]
  );

  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const sortBy = (searchParams.get('sortBy') ?? 'ticketNumber') as ListSortField;
  const sortDir = searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc';
  const listQuery = useTicketList(project?.id, { ...filters, sortBy, sortDir });
  const tags = useProjectTags(project?.id);

  const setSort = (field: ListSortField) => {
    if (field === sortBy) {
      setSearchParams(setParam(searchParams, 'sortDir', sortDir === 'asc' ? 'desc' : 'asc'), { replace: true });
    } else {
      const next = setParam(searchParams, 'sortBy', field);
      next.set('sortDir', 'asc');
      setSearchParams(next, { replace: true });
    }
  };

  if (projects.isLoading) return <Spinner />;
  if (!project) return <div className="p-6 text-sm text-text-muted">Project not found.</div>;

  const tickets = listQuery.data?.tickets ?? [];
  const total = listQuery.data?.total ?? 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{project.name}</h1>
          <div className="text-[11px] text-text-muted">
            {project.projectKey} · {total} tickets
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <Link
            to={`/p/${project.slug}/board`}
            className="flex items-center gap-1 text-text-muted hover:text-text"
          >
            <Columns3 size={13} /> Board
          </Link>
        </div>
      </header>

      <div className="border-b border-border bg-surface px-4 py-2">
        <FilterBar
          searchParams={searchParams}
          setSearchParams={(next) => setSearchParams(next)}
          tags={tags.data?.tags ?? []}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {listQuery.isLoading ? (
          <Spinner />
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-14 text-center text-sm text-text-muted">
            <Inbox size={20} />
            No tickets match the current filters.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm" data-testid="list-table">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
                {(
                  [
                    ['ticketNumber', 'Ticket'],
                    [null, 'Title'],
                    ['status', 'Status'],
                    [null, 'Blocked'],
                    ['priority', 'Priority'],
                    [null, 'Type'],
                    [null, 'Tags'],
                    ['updatedAt', 'Updated'],
                    [null, 'Deployed'],
                  ] as [ListSortField | null, string][]
                ).map(([field, label]) => (
                  <th key={label} className="px-2 py-1.5 font-medium">
                    {field ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 hover:text-text"
                        onClick={() => setSort(field)}
                      >
                        {label}
                        {sortBy === field ? <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer border-b border-border/60 hover:bg-surface-2/60"
                  onClick={() => navigate(`/p/${project.slug}/tickets/${t.id}`)}
                  data-testid={`list-row-${t.displayId}`}
                >
                  <td className="px-2 py-1.5 font-mono text-xs text-text-muted">{t.displayId}</td>
                  <td className="max-w-md truncate px-2 py-1.5">
                    {t.title}
                    {t.limitations ? (
                      <span className="ml-2 inline-block align-middle">
                        <LimitationsBadge />
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-xs">{t.status.replace('_', ' ')}</td>
                  <td className="px-2 py-1.5">{t.isBlocked ? <BlockedBadge reason={t.blockedReason} /> : <span className="text-text-muted/40">—</span>}</td>
                  <td className="px-2 py-1.5"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-2 py-1.5"><TypeBadge type={t.type} /></td>
                  <td className="px-2 py-1.5 text-[10px] text-text-muted">{t.sourceReference ?? ''}</td>
                  <td className="px-2 py-1.5 text-xs text-text-muted">{fmtDate(t.updatedAt)}</td>
                  <td className="px-2 py-1.5 text-xs text-text-muted">{fmtDate(t.deployedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
