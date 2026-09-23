import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  BOARD_COLUMN_STATUSES,
  displayTicketId,
  type BoardDto,
  type CreateTicketInput,
  type TicketActivityDto,
  type TicketDetailDto,
  type TicketDto,
  type UpdateTicketInput,
} from '@zakisu-tickets/shared';
import { getDb, getPool } from '../../db/client.js';
import { projects, ticketActivities, tickets } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import { dbDatetimeToIso, toMysqlDatetime } from '../../lib/dates.js';
import { ApiError } from '../../lib/errors.js';

type TicketRow = typeof tickets.$inferSelect;

function toDto(row: TicketRow, projectKey: string): TicketDto {
  return {
    id: row.id,
    projectId: row.projectId,
    projectKey,
    displayId: displayTicketId(projectKey, row.ticketNumber),
    ticketNumber: row.ticketNumber,
    version: row.version,
    title: row.title,
    status: row.status,
    priority: row.priority,
    type: row.type,
    summary: row.summary ?? null,
    description: row.description ?? null,
    motivation: row.motivation ?? null,
    acceptanceCriteria: row.acceptanceCriteria ?? null,
    implementationNotes: row.implementationNotes ?? null,
    testingNotes: row.testingNotes ?? null,
    deploymentNotes: row.deploymentNotes ?? null,
    limitations: row.limitations ?? null,
    knownIssues: row.knownIssues ?? null,
    followUpNotes: row.followUpNotes ?? null,
    blockedReason: row.blockedReason ?? null,
    sourceReference: row.sourceReference ?? null,
    archivedAt: dbDatetimeToIso(row.archivedAt),
    startedAt: dbDatetimeToIso(row.startedAt),
    implementedAt: dbDatetimeToIso(row.implementedAt),
    testedAt: dbDatetimeToIso(row.testedAt),
    deployedAt: dbDatetimeToIso(row.deployedAt),
    createdAt: dbDatetimeToIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: dbDatetimeToIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

/** Resolve a ticket to its owner through its project; 404 on any mismatch. */
export async function getOwnedTicketContextOr404(
  ticketId: string,
  ownerId: string
): Promise<{ ticket: TicketRow; projectKey: string }> {
  const db = getDb();
  const rows = await db
    .select({ ticket: tickets, projectKey: projects.projectKey })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(eq(tickets.id, ticketId), eq(projects.ownerId, ownerId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw ApiError.notFound('Ticket not found');
  return { ticket: row.ticket, projectKey: row.projectKey };
}

/**
 * Atomic per-project ticket numbering.
 * UPDATE ... SET last_number = LAST_INSERT_ID(last_number + 1) makes the read of
 * the allocated value safe within the same connection; the UNIQUE(project_id,
 * ticket_number) constraint is the backstop. Never MAX()+1. Numbers are never reused.
 */
export async function allocateTicketNumber(conn: PoolConnection, projectId: string): Promise<number> {
  await conn.execute(
    `UPDATE project_ticket_counters SET last_number = LAST_INSERT_ID(last_number + 1) WHERE project_id = ?`,
    [projectId]
  );
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT LAST_INSERT_ID() AS n`);
  return Number((rows[0] as { n: number }).n);
}

export async function ensureCounterRow(conn: PoolConnection, projectId: string): Promise<void> {
  await conn.execute(
    `INSERT INTO project_ticket_counters (project_id, last_number) VALUES (?, 0) ON DUPLICATE KEY UPDATE last_number = last_number`,
    [projectId]
  );
}

// ---------------------------------------------------------------------------
// Activity — written with raw SQL on the SAME connection/transaction as the
// mutation it describes, so product history can never drift from state.
// Metadata carries safe facts only (field names, from/to) — never long text.
// ---------------------------------------------------------------------------
interface ActivityEntry {
  type: (typeof ticketActivities.$inferInsert)['type'];
  metadata?: Record<string, unknown>;
}

async function insertActivity(
  conn: PoolConnection,
  ticketId: string,
  actorUserId: string | null,
  entries: ActivityEntry[]
): Promise<void> {
  for (const entry of entries) {
    await conn.execute(
      `INSERT INTO ticket_activities (id, ticket_id, actor_user_id, type, metadata) VALUES (?, ?, ?, ?, ?)`,
      [
        newId(),
        ticketId,
        actorUserId,
        entry.type,
        entry.metadata === undefined ? null : JSON.stringify(entry.metadata),
      ]
    );
  }
}

// ---------------------------------------------------------------------------
// Create (quick create: title + defaults; server allocates the number)
// ---------------------------------------------------------------------------
export async function createTicket(
  projectId: string,
  ownerId: string,
  input: CreateTicketInput
): Promise<TicketDto> {
  const project = await getOwnedProjectOr404Row(projectId, ownerId);

  const conn = await getPool().getConnection();
  let released = false;
  try {
    await conn.beginTransaction();
    await ensureCounterRow(conn, project.id);
    const ticketNumber = await allocateTicketNumber(conn, project.id);

    const id = newId();
    const status = input.status ?? 'PLANNED';
    const now = toMysqlDatetime(new Date());
    await conn.execute(
      `INSERT INTO tickets (id, project_id, ticket_number, title, status, priority, type, created_at, updated_at, started_at, implemented_at, tested_at, deployed_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        project.id,
        ticketNumber,
        input.title,
        status,
        input.priority ?? 'P2',
        input.type ?? 'FEATURE',
        now,
        now,
        status === 'IN_PROGRESS' ? now : null,
        status === 'IMPLEMENTED' ? now : null,
        status === 'TESTED' ? now : null,
        status === 'DEPLOYED' ? now : null,
      ]
    );

    const metadata: Record<string, unknown> = {
      status,
      priority: input.priority ?? 'P2',
      type: input.type ?? 'FEATURE',
    };
    if (status !== 'PLANNED') {
      metadata.initialStatus = status;
    }
    await insertActivity(conn, id, ownerId, [{ type: 'TICKET_CREATED', metadata }]);

    await conn.commit();
    conn.release();
    released = true;
    // Read AFTER releasing the connection so concurrent creates cannot exhaust the pool.
    const { ticket, projectKey } = await getOwnedTicketContextOr404(id, ownerId);
    return toDto(ticket, projectKey);
  } catch (err) {
    if (!released) await conn.rollback();
    throw err;
  } finally {
    if (!released) conn.release();
  }
}

/** Internal helper returning the raw project row. */
async function getOwnedProjectOr404Row(projectId: string, ownerId: string) {
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

// ---------------------------------------------------------------------------
// Update — optimistic concurrency + transitions + transactional activity.
// The UPDATE carries "AND version = expected"; affected-rows 0 after a confirmed
// existing ticket means a concurrent edit won the race => 409 STALE_UPDATE.
// ---------------------------------------------------------------------------
const MILESTONE_FIELD: Partial<Record<TicketRow['status'], 'started_at' | 'implemented_at' | 'tested_at' | 'deployed_at'>> = {
  IN_PROGRESS: 'started_at',
  IMPLEMENTED: 'implemented_at',
  TESTED: 'tested_at',
  DEPLOYED: 'deployed_at',
};

export async function updateTicket(
  ticketId: string,
  ownerId: string,
  input: UpdateTicketInput
): Promise<TicketDto> {
  await getOwnedTicketContextOr404(ticketId, ownerId); // 404 early for foreign tickets
  const conn = await getPool().getConnection();
  let released = false;
  try {
    await conn.beginTransaction();

    // Re-read inside the transaction for a consistent decision basis.
    const [currentRows] = await conn.execute(
      `SELECT * FROM tickets WHERE id = ? FOR UPDATE`,
      [ticketId]
    );
    const current = (currentRows as unknown as TicketRow[])[0];
    if (!current) {
      throw ApiError.notFound('Ticket not found');
    }
    if (current.version !== input.version) {
      throw ApiError.staleUpdate();
    }

    const now = toMysqlDatetime(new Date());
    const sets: string[] = ['version = version + 1', 'updated_at = ?'];
    const params: unknown[] = [now];
    const activity: ActivityEntry[] = [];

    // --- status transition ---
    if (input.status !== undefined && input.status !== current.status) {
      const next = input.status;
      if (next === 'BLOCKED') {
        const reason = input.blockedReason?.trim();
        if (!reason) {
          throw ApiError.validation('A blocked reason is required to mark a ticket BLOCKED');
        }
        sets.push('blocked_reason = ?');
        params.push(reason);
      }
      if (current.status === 'BLOCKED' && next !== 'BLOCKED') {
        // Preserve the previous reason in activity; clear the live field.
        // (Raw row: snake_case columns.)
        activity.push({
          type: 'UNBLOCKED',
          metadata: {
            previousReason: (current as unknown as Record<string, string | null>)['blocked_reason'] ?? null,
            to: next,
          },
        });
        sets.push('blocked_reason = NULL');
      }
      if (next === 'BLOCKED') {
        activity.push({ type: 'BLOCKED', metadata: { reason: input.blockedReason!.trim() } });
      }
      activity.push({
        type: 'STATUS_CHANGED',
        metadata: { from: current.status, to: next },
      });
      sets.push('status = ?');
      params.push(next);
      const field = MILESTONE_FIELD[next];
      if (field) {
        // Set only if absent; backward moves never erase history.
        sets.push(`${field} = COALESCE(${field}, ?)`);
        params.push(now);
      }
      if (next === 'ARCHIVED') {
        sets.push('archived_at = COALESCE(archived_at, ?)');
        params.push(now);
        activity.push({ type: 'TICKET_ARCHIVED' });
      }
      if (current.status === 'ARCHIVED' && next !== 'ARCHIVED') {
        sets.push('archived_at = NULL');
        activity.push({ type: 'TICKET_RESTORED' });
      }
    } else if (input.blockedReason !== undefined && current.status === 'BLOCKED') {
      sets.push('blocked_reason = ?');
      params.push(input.blockedReason);
    }

    // --- simple fields ---
    if (input.title !== undefined && input.title !== current.title) {
      activity.push({ type: 'TITLE_CHANGED', metadata: { from: current.title, to: input.title } });
      sets.push('title = ?');
      params.push(input.title);
    }
    if (input.priority !== undefined && input.priority !== current.priority) {
      activity.push({ type: 'PRIORITY_CHANGED', metadata: { from: current.priority, to: input.priority } });
      sets.push('priority = ?');
      params.push(input.priority);
    }
    if (input.type !== undefined && input.type !== current.type) {
      activity.push({ type: 'TYPE_CHANGED', metadata: { from: current.type, to: input.type } });
      sets.push('type = ?');
      params.push(input.type);
    }

    // --- long-text fields: one summarized activity entry per save ---
    const textFieldMap: Partial<Record<keyof UpdateTicketInput, string>> = {
      summary: 'summary',
      description: 'description',
      motivation: 'motivation',
      acceptanceCriteria: 'acceptanceCriteria',
      implementationNotes: 'implementationNotes',
      testingNotes: 'testingNotes',
      deploymentNotes: 'deploymentNotes',
      limitations: 'limitations',
      knownIssues: 'knownIssues',
      followUpNotes: 'followUpNotes',
      sourceReference: 'sourceReference',
    };
    const changedTextFields: string[] = [];
    for (const [inputKey, column] of Object.entries(textFieldMap)) {
      const value = input[inputKey as keyof UpdateTicketInput];
      if (value === undefined) continue;
      const currentValue = (current as unknown as Record<string, string | null>)[column];
      if (value !== currentValue) {
        sets.push(`${column} = ?`);
        params.push(value);
        changedTextFields.push(column);
      }
    }
    if (changedTextFields.length > 0) {
      activity.push({ type: 'FIELDS_UPDATED', metadata: { fields: changedTextFields } });
    }

    // Apply guarded by the expected version (optimistic concurrency).
    const [result] = await conn.query(
      `UPDATE tickets SET ${sets.join(', ')} WHERE id = ? AND version = ?`,
      [...params, ticketId, input.version]
    );
    const affected = (result as unknown as { affectedRows: number }).affectedRows;
    if (affected === 0) {
      // Row exists (we read it) but version moved => someone else updated it.
      throw ApiError.staleUpdate();
    }

    if (activity.length > 0) {
      await insertActivity(conn, ticketId, ownerId, activity);
    }

    await conn.commit();
    conn.release();
    released = true;
    // Read AFTER releasing the connection so concurrent updates cannot exhaust the pool.
    const { ticket: updated, projectKey: key } = await getOwnedTicketContextOr404(ticketId, ownerId);
    return toDto(updated, key);
  } catch (err) {
    if (!released) await conn.rollback();
    throw err;
  } finally {
    if (!released) conn.release();
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getTicketDetail(ticketId: string, ownerId: string): Promise<TicketDetailDto> {
  const { ticket, projectKey } = await getOwnedTicketContextOr404(ticketId, ownerId);
  const db = getDb();
  const activityRows = await db
    .select()
    .from(ticketActivities)
    .where(eq(ticketActivities.ticketId, ticketId))
    .orderBy(desc(ticketActivities.seq), desc(ticketActivities.id));
  const activity: TicketActivityDto[] = activityRows.map((a) => ({
    id: a.id,
    ticketId: a.ticketId,
    type: a.type,
    metadata: (a.metadata ?? null) as Record<string, unknown> | null,
    createdAt: dbDatetimeToIso(a.createdAt) ?? new Date(0).toISOString(),
    seq: a.seq,
  }));
  return { ...toDto(ticket, projectKey), activity };
}

export async function getBoard(projectId: string, ownerId: string): Promise<BoardDto> {
  const project = await getOwnedProjectOr404Row(projectId, ownerId);
  const db = getDb();
  const rows = await db
    .select({ ticket: tickets, projectKey: projects.projectKey })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(eq(tickets.projectId, projectId), ne(tickets.status, 'ARCHIVED')))
    .orderBy(desc(tickets.priority), asc(tickets.ticketNumber));

  const columns = [...BOARD_COLUMN_STATUSES, 'BLOCKED' as const].map((status) => ({
    status,
    tickets: rows
      .filter((r) => r.ticket.status === status)
      .map((r) => toDto(r.ticket, r.projectKey)),
  }));

  return { projectId: project.id, projectKey: project.projectKey, columns };
}

// ---------------------------------------------------------------------------
// Archive / restore — lightweight dedicated transitions (activity recorded).
// ---------------------------------------------------------------------------
export async function setTicketArchived(
  ticketId: string,
  ownerId: string,
  archived: boolean
): Promise<TicketDto> {
  const { ticket } = await getOwnedTicketContextOr404(ticketId, ownerId);
  return updateTicket(ticketId, ownerId, {
    version: ticket.version,
    status: archived ? 'ARCHIVED' : 'PLANNED',
  });
}
