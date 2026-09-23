import { and, asc, desc, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm';
import type { TagDto, TicketDto } from '@zakisu-tickets/shared';
import { getDb } from '../../db/client.js';
import { projects, tags, ticketTags, tickets } from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { toDto as ticketToDto } from './tickets.service.js';

type TicketRow = typeof tickets.$inferSelect;

function toLite(row: { ticket: TicketRow; projectKey: string }): TicketDto {
  return ticketToDto(row.ticket, row.projectKey);
}

async function getOwnedProjectRow(projectId: string, ownerId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw ApiError.notFound('Project not found');
  return row;
}

/** All projects of the owner, keyed by id — for global views' project identity. */
async function getOwnedProjectKeyMap(ownerId: string): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select({ id: projects.id, projectKey: projects.projectKey })
    .from(projects)
    .where(eq(projects.ownerId, ownerId));
  return new Map(rows.map((r) => [r.id, r.projectKey]));
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export interface ProjectDashboardDto {
  projectId: string;
  projectKey: string;
  counts: {
    planned: number;
    inProgress: number;
    implemented: number;
    tested: number;
    deployed: number;
    blocked: number; // orthogonal: overlaps lifecycle counts
  };
  recentlyUpdated: TicketDto[];
  recentlyDeployed: TicketDto[];
  currentBlockers: TicketDto[];
}

export async function getProjectDashboard(
  projectId: string,
  ownerId: string,
): Promise<ProjectDashboardDto> {
  const project = await getOwnedProjectRow(projectId, ownerId);
  const db = getDb();
  const active = and(eq(tickets.projectId, projectId), isNull(tickets.archivedAt));

  // One grouped count query for lifecycle; one for blocked.
  const [statusRows, blockedRows, updatedRows, deployedRows, blockedTicketRows] = await Promise.all(
    [
      db
        .select({ status: tickets.status, count: sql<number>`count(*)` })
        .from(tickets)
        .where(active)
        .groupBy(tickets.status),
      db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(and(active, eq(tickets.isBlocked, true))),
      db
        .select({ ticket: tickets, projectKey: projects.projectKey })
        .from(tickets)
        .innerJoin(projects, eq(projects.id, tickets.projectId))
        .where(active)
        .orderBy(desc(tickets.updatedAt))
        .limit(8),
      db
        .select({ ticket: tickets, projectKey: projects.projectKey })
        .from(tickets)
        .innerJoin(projects, eq(projects.id, tickets.projectId))
        .where(and(active, eq(tickets.status, 'DEPLOYED'), isNotNull(tickets.deployedAt)))
        .orderBy(desc(tickets.deployedAt))
        .limit(8),
      db
        .select({ ticket: tickets, projectKey: projects.projectKey })
        .from(tickets)
        .innerJoin(projects, eq(projects.id, tickets.projectId))
        .where(and(active, eq(tickets.isBlocked, true)))
        .orderBy(desc(tickets.updatedAt))
        .limit(20),
    ],
  );

  const counts: ProjectDashboardDto['counts'] = {
    planned: 0,
    inProgress: 0,
    implemented: 0,
    tested: 0,
    deployed: 0,
    blocked: Number(blockedRows[0]?.count ?? 0),
  };
  for (const row of statusRows) {
    if (row.status === 'PLANNED') counts.planned = Number(row.count);
    else if (row.status === 'IN_PROGRESS') counts.inProgress = Number(row.count);
    else if (row.status === 'IMPLEMENTED') counts.implemented = Number(row.count);
    else if (row.status === 'TESTED') counts.tested = Number(row.count);
    else if (row.status === 'DEPLOYED') counts.deployed = Number(row.count);
  }

  return {
    projectId: project.id,
    projectKey: project.projectKey,
    counts,
    recentlyUpdated: updatedRows.map(toLite),
    recentlyDeployed: deployedRows.map(toLite),
    currentBlockers: blockedTicketRows.map(toLite),
  };
}

// ---------------------------------------------------------------------------
// Focus — "what needs my attention?" Blocked is orthogonal to status.
// ---------------------------------------------------------------------------

/**
 * A focus ticket carries the project key so the global view can show identity.
 * Each ticket appears in exactly ONE category: the furthest lifecycle category
 * wins (TESTED-awaiting-deploy > IMPLEMENTED-awaiting-test > BLOCKED > IN
 * PROGRESS), so a blocked IMPLEMENTED ticket shows under
 * IMPLEMENTED-but-blocked, not twice.
 */
export interface FocusGroupDto {
  key: 'in_progress' | 'blocked' | 'implemented_awaiting_test' | 'tested_awaiting_deploy';
  tickets: TicketDto[];
}

export interface FocusDto {
  groups: FocusGroupDto[];
}

const FOCUS_PRIORITY_ORDER = sql`CASE ${tickets.priority} WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`;

function dedupeByFurthestStage(
  inProgress: TicketRow[],
  blocked: TicketRow[],
  implemented: TicketRow[],
  tested: TicketRow[],
) {
  const stageRank: Record<string, number> = {
    in_progress: 0,
    blocked: 1,
    implemented_awaiting_test: 2,
    tested_awaiting_deploy: 3,
  };
  const chosen = new Map<string, { stage: string; ticket: TicketRow }>();
  for (const t of inProgress) chosen.set(t.id, { stage: 'in_progress', ticket: t });
  for (const t of blocked) {
    const prev = chosen.get(t.id);
    if (!prev || stageRank['blocked'] > stageRank[prev.stage])
      chosen.set(t.id, { stage: 'blocked', ticket: t });
  }
  for (const t of implemented) {
    const prev = chosen.get(t.id);
    if (!prev || stageRank['implemented_awaiting_test'] > stageRank[prev.stage]) {
      chosen.set(t.id, { stage: 'implemented_awaiting_test', ticket: t });
    }
  }
  for (const t of tested) {
    const prev = chosen.get(t.id);
    if (!prev || stageRank['tested_awaiting_deploy'] > stageRank[prev.stage]) {
      chosen.set(t.id, { stage: 'tested_awaiting_deploy', ticket: t });
    }
  }
  return chosen;
}

export async function getFocus(ownerId: string, projectId?: string): Promise<FocusDto> {
  if (projectId) await getOwnedProjectRow(projectId, ownerId);
  const db = getDb();
  const scope = projectId
    ? and(eq(projects.ownerId, ownerId), eq(tickets.projectId, projectId))
    : eq(projects.ownerId, ownerId);
  const active = and(scope, isNull(tickets.archivedAt));

  const [inProgress, blocked, implemented, tested] = await Promise.all([
    db
      .select({ ticket: tickets, projectKey: projects.projectKey })
      .from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(and(active, eq(tickets.status, 'IN_PROGRESS'), eq(tickets.isBlocked, false)))
      .orderBy(FOCUS_PRIORITY_ORDER, asc(tickets.ticketNumber)),
    db
      .select({ ticket: tickets, projectKey: projects.projectKey })
      .from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(and(active, eq(tickets.isBlocked, true)))
      .orderBy(FOCUS_PRIORITY_ORDER, asc(tickets.ticketNumber)),
    db
      .select({ ticket: tickets, projectKey: projects.projectKey })
      .from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(and(active, eq(tickets.status, 'IMPLEMENTED')))
      .orderBy(FOCUS_PRIORITY_ORDER, asc(tickets.ticketNumber)),
    db
      .select({ ticket: tickets, projectKey: projects.projectKey })
      .from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(and(active, eq(tickets.status, 'TESTED')))
      .orderBy(FOCUS_PRIORITY_ORDER, asc(tickets.ticketNumber)),
  ]);

  const chosen = dedupeByFurthestStage(
    inProgress.map((r) => r.ticket),
    blocked.map((r) => r.ticket),
    implemented.map((r) => r.ticket),
    tested.map((r) => r.ticket),
  );
  const keyMap = await getOwnedProjectKeyMap(ownerId);

  const groups: FocusGroupDto[] = [
    { key: 'in_progress', tickets: [] },
    { key: 'blocked', tickets: [] },
    { key: 'implemented_awaiting_test', tickets: [] },
    { key: 'tested_awaiting_deploy', tickets: [] },
  ];
  for (const { stage, ticket } of chosen.values()) {
    const dto = ticketToDto(ticket, keyMap.get(ticket.projectId) ?? '');
    const group = groups.find((g) => g.key === stage);
    group?.tickets.push(dto);
  }
  return { groups };
}

// ---------------------------------------------------------------------------
// Accomplishments — DEPLOYED grouped by deployedAt recency.
// ---------------------------------------------------------------------------
export interface AccomplishmentsDto {
  groups: {
    key: 'today' | 'this_week' | 'this_month' | 'older';
    label: string;
    tickets: TicketDto[];
    /** Tickets with status=DEPLOYED but unexpectedly-null deployedAt are surfaced, never invented. */
    dataIssues: { ticketId: string; displayId: string; issue: string }[];
  }[];
}

export async function getAccomplishments(
  projectId: string,
  ownerId: string,
  includeArchived = false,
): Promise<AccomplishmentsDto> {
  await getOwnedProjectRow(projectId, ownerId);
  const db = getDb();
  const conditions = [eq(tickets.projectId, projectId), eq(tickets.status, 'DEPLOYED')];
  if (!includeArchived) conditions.push(isNull(tickets.archivedAt));

  const rows = await db
    .select({ ticket: tickets, projectKey: projects.projectKey })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(...conditions))
    .orderBy(desc(tickets.deployedAt), desc(tickets.ticketNumber));

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7)); // Monday
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups: AccomplishmentsDto['groups'] = [
    { key: 'today', label: 'Today', tickets: [], dataIssues: [] },
    { key: 'this_week', label: 'This week', tickets: [], dataIssues: [] },
    { key: 'this_month', label: 'This month', tickets: [], dataIssues: [] },
    { key: 'older', label: 'Older', tickets: [], dataIssues: [] },
  ];

  for (const row of rows) {
    const dto = toLite(row);
    if (!row.ticket.deployedAt) {
      // DEPLOYED with no timestamp: report honestly, never fabricate.
      groups[0].dataIssues.push({
        ticketId: row.ticket.id,
        displayId: dto.displayId,
        issue: 'Deployed ticket is missing its deployedAt timestamp.',
      });
      continue;
    }
    const deployed = new Date(
      `${row.ticket.deployedAt.slice(0, 10)}T${row.ticket.deployedAt.slice(11)}Z`,
    );
    if (deployed >= startOfToday) groups[0].tickets.push(dto);
    else if (deployed >= startOfWeek) groups[1].tickets.push(dto);
    else if (deployed >= startOfMonth) groups[2].tickets.push(dto);
    else groups[3].tickets.push(dto);
  }
  return { groups };
}

// ---------------------------------------------------------------------------
// Tag aggregation for the list view (no N+1): one query per list page.
// ---------------------------------------------------------------------------
export async function getTagsForTickets(ticketIds: string[]): Promise<Map<string, TagDto[]>> {
  if (ticketIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({ ticketId: ticketTags.ticketId, tag: tags })
    .from(ticketTags)
    .innerJoin(tags, eq(tags.id, ticketTags.tagId))
    .where(inArray(ticketTags.ticketId, ticketIds))
    .orderBy(asc(tags.name));
  const map = new Map<string, TagDto[]>();
  for (const row of rows) {
    const list = map.get(row.ticketId) ?? [];
    list.push({
      id: row.tag.id,
      projectId: row.tag.projectId,
      name: row.tag.name,
      slug: row.tag.slug,
      color: row.tag.color ?? null,
    });
    map.set(row.ticketId, list);
  }
  return map;
}
