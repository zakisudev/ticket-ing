import { and, asc, desc, eq, inArray, isNull, isNotNull, or, like, sql } from 'drizzle-orm';
import { BOARD_COLUMN_STATUSES, displayTicketId, } from '@zakisu-tickets/shared';
import { getDb, getPool } from '../../db/client.js';
import { projects, tags as tagsTable, ticketActivities, ticketTags, tickets } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import { dbDatetimeToIso, toMysqlDatetime } from '../../lib/dates.js';
import { ApiError } from '../../lib/errors.js';
export function toDto(row, projectKey) {
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
        isBlocked: row.isBlocked,
        blockedReason: row.blockedReason ?? null,
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
export async function getOwnedTicketContextOr404(ticketId, ownerId) {
    const db = getDb();
    const rows = await db
        .select({ ticket: tickets, projectKey: projects.projectKey })
        .from(tickets)
        .innerJoin(projects, eq(projects.id, tickets.projectId))
        .where(and(eq(tickets.id, ticketId), eq(projects.ownerId, ownerId)))
        .limit(1);
    const row = rows[0];
    if (!row)
        throw ApiError.notFound('Ticket not found');
    return { ticket: row.ticket, projectKey: row.projectKey };
}
/**
 * Atomic per-project ticket numbering.
 * UPDATE ... SET last_number = LAST_INSERT_ID(last_number + 1) makes the read of
 * the allocated value safe within the same connection; the UNIQUE(project_id,
 * ticket_number) constraint is the backstop. Never MAX()+1. Numbers are never reused.
 */
export async function allocateTicketNumber(conn, projectId) {
    await conn.execute(`UPDATE project_ticket_counters SET last_number = LAST_INSERT_ID(last_number + 1) WHERE project_id = ?`, [projectId]);
    const [rows] = await conn.query(`SELECT LAST_INSERT_ID() AS n`);
    return Number(rows[0].n);
}
export async function ensureCounterRow(conn, projectId) {
    await conn.execute(`INSERT INTO project_ticket_counters (project_id, last_number) VALUES (?, 0) ON DUPLICATE KEY UPDATE last_number = last_number`, [projectId]);
}
export async function insertActivity(conn, ticketId, actorUserId, entries) {
    for (const entry of entries) {
        await conn.execute(`INSERT INTO ticket_activities (id, ticket_id, actor_user_id, type, metadata) VALUES (?, ?, ?, ?, ?)`, [
            newId(),
            ticketId,
            actorUserId,
            entry.type,
            entry.metadata === undefined ? null : JSON.stringify(entry.metadata),
        ]);
    }
}
// ---------------------------------------------------------------------------
// Create (quick create: title + defaults; server allocates the number)
// ---------------------------------------------------------------------------
export async function createTicket(projectId, ownerId, input) {
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
        await conn.execute(`INSERT INTO tickets (id, project_id, ticket_number, title, status, priority, type, created_at, updated_at, started_at, implemented_at, tested_at, deployed_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, [
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
        ]);
        const metadata = {
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
    }
    catch (err) {
        if (!released)
            await conn.rollback();
        throw err;
    }
    finally {
        if (!released)
            conn.release();
    }
}
/** Internal helper returning the raw project row. */
async function getOwnedProjectOr404Row(projectId, ownerId) {
    const db = getDb();
    const rows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
        .limit(1);
    const row = rows[0];
    if (!row)
        throw ApiError.notFound('Project not found');
    return row;
}
// ---------------------------------------------------------------------------
// Update — optimistic concurrency + lifecycle transitions + transactional activity.
// The UPDATE carries "AND version = expected"; affected-rows 0 after a confirmed
// existing ticket means a concurrent edit won the race => 409 STALE_UPDATE.
//
// Orthogonal conditions (product invariant):
// - isBlocked/blockedReason answer "can work currently continue?" and never
//   change lifecycle status. Blocking requires a non-empty reason; unblocking
//   clears the live reason but preserves the previous one in BLOCKED/UNBLOCKED
//   activity metadata.
// - archivedAt is set on archive / cleared on restore and never touches status.
// ---------------------------------------------------------------------------
const MILESTONE_FIELD = {
    IN_PROGRESS: 'started_at',
    IMPLEMENTED: 'implemented_at',
    TESTED: 'tested_at',
    DEPLOYED: 'deployed_at',
};
/** Text fields compared column-name => input-key; single summarized activity entry per save. */
const TEXT_FIELD_MAP = {
    summary: 'summary',
    description: 'description',
    motivation: 'motivation',
    acceptance_criteria: 'acceptanceCriteria',
    implementation_notes: 'implementationNotes',
    testing_notes: 'testingNotes',
    deployment_notes: 'deploymentNotes',
    limitations: 'limitations',
    known_issues: 'knownIssues',
    follow_up_notes: 'followUpNotes',
    source_reference: 'sourceReference',
};
export async function updateTicket(ticketId, ownerId, input) {
    await getOwnedTicketContextOr404(ticketId, ownerId); // 404 early for foreign tickets
    const conn = await getPool().getConnection();
    let released = false;
    try {
        await conn.beginTransaction();
        // Re-read inside the transaction for a consistent decision basis.
        const [currentRows] = await conn.execute(`SELECT * FROM tickets WHERE id = ? FOR UPDATE`, [
            ticketId,
        ]);
        const current = currentRows[0];
        if (!current) {
            throw ApiError.notFound('Ticket not found');
        }
        if (current.version !== input.version) {
            throw ApiError.staleUpdate();
        }
        // Raw SELECT * yields snake_case columns; alias what we need.
        const raw = current;
        const rawCol = (name) => raw[name];
        const now = toMysqlDatetime(new Date());
        const sets = ['version = version + 1', 'updated_at = ?'];
        const params = [now];
        const activity = [];
        // --- lifecycle transition (orthogonal conditions never touch status) ---
        if (input.status !== undefined && input.status !== current.status) {
            const next = input.status;
            activity.push({ type: 'STATUS_CHANGED', metadata: { from: current.status, to: next } });
            sets.push('status = ?');
            params.push(next);
            const field = MILESTONE_FIELD[next];
            if (field) {
                // Set only if absent; backward moves never erase history.
                sets.push(`${field} = COALESCE(${field}, ?)`);
                params.push(now);
            }
        }
        // --- orthogonal blocked condition ---
        if (input.isBlocked !== undefined) {
            if (input.isBlocked && !rawCol('is_blocked')) {
                const reason = input.blockedReason?.trim();
                if (!reason) {
                    throw ApiError.validation('A blocked reason is required to block a ticket');
                }
                sets.push('is_blocked = TRUE', 'blocked_reason = ?');
                params.push(reason);
                activity.push({ type: 'BLOCKED', metadata: { reason } });
            }
            else if (!input.isBlocked && rawCol('is_blocked')) {
                // Preserve the previous reason in activity; clear the live field.
                const previousReason = rawCol('blocked_reason');
                sets.push('is_blocked = FALSE', 'blocked_reason = NULL');
                activity.push({ type: 'UNBLOCKED', metadata: { previousReason } });
            }
            else if (input.isBlocked && input.blockedReason !== undefined) {
                // Re-blocking with a new reason updates the reason (still blocked).
                const reason = input.blockedReason?.trim();
                if (reason && reason !== rawCol('blocked_reason')) {
                    sets.push('blocked_reason = ?');
                    params.push(reason);
                    activity.push({ type: 'BLOCKED', metadata: { reason, updated: true } });
                }
            }
        }
        // --- orthogonal archive condition ---
        if (input.archived !== undefined) {
            const currentlyArchived = rawCol('archived_at') != null;
            if (input.archived && !currentlyArchived) {
                sets.push('archived_at = COALESCE(archived_at, ?)');
                params.push(now);
                activity.push({ type: 'TICKET_ARCHIVED' });
            }
            else if (!input.archived && currentlyArchived) {
                sets.push('archived_at = NULL');
                activity.push({ type: 'TICKET_RESTORED' });
            }
        }
        // --- simple fields ---
        if (input.title !== undefined && input.title !== current.title) {
            activity.push({ type: 'TITLE_CHANGED', metadata: { from: current.title, to: input.title } });
            sets.push('title = ?');
            params.push(input.title);
        }
        if (input.priority !== undefined && input.priority !== current.priority) {
            activity.push({
                type: 'PRIORITY_CHANGED',
                metadata: { from: current.priority, to: input.priority },
            });
            sets.push('priority = ?');
            params.push(input.priority);
        }
        if (input.type !== undefined && input.type !== current.type) {
            activity.push({ type: 'TYPE_CHANGED', metadata: { from: current.type, to: input.type } });
            sets.push('type = ?');
            params.push(input.type);
        }
        // --- long-text fields: one summarized activity entry per save ---
        const changedTextFields = [];
        for (const [column, inputKey] of Object.entries(TEXT_FIELD_MAP)) {
            const value = input[inputKey];
            if (value === undefined)
                continue;
            const currentValue = rawCol(column);
            if (value !== currentValue) {
                sets.push(`${column} = ?`);
                params.push(value);
                changedTextFields.push(inputKey);
            }
        }
        if (changedTextFields.length > 0) {
            activity.push({ type: 'FIELDS_UPDATED', metadata: { fields: changedTextFields } });
        }
        // Apply guarded by the expected version (optimistic concurrency).
        const [result] = await conn.query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ? AND version = ?`, [...params, ticketId, input.version]);
        const affected = result.affectedRows;
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
    }
    catch (err) {
        if (!released)
            await conn.rollback();
        throw err;
    }
    finally {
        if (!released)
            conn.release();
    }
}
// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getTicketDetailBase(ticketId, ownerId) {
    const { ticket, projectKey } = await getOwnedTicketContextOr404(ticketId, ownerId);
    const db = getDb();
    const activityRows = await db
        .select()
        .from(ticketActivities)
        .where(eq(ticketActivities.ticketId, ticketId))
        .orderBy(desc(ticketActivities.seq));
    const activity = activityRows.map((a) => ({
        id: a.id,
        ticketId: a.ticketId,
        type: a.type,
        metadata: (a.metadata ?? null),
        createdAt: dbDatetimeToIso(a.createdAt) ?? new Date(0).toISOString(),
        seq: a.seq,
    }));
    return { ...toDto(ticket, projectKey), activity };
}
// ---------------------------------------------------------------------------
// Search + filters + list sorting (project-scoped, owner-enforced).
//
// Search priority: exact/prefix display-ID, then title, then LIKE across the
// long engineering fields. MySQL FULLTEXT is deliberately not used yet: the
// scale is a single owner's projects, and LIKE avoids the natural-language/
// boolean-mode behavioral split between MySQL and MariaDB. This keeps results
// identical everywhere; a FULLTEXT path can be added later behind the same
// interface without changing results semantics.
// ---------------------------------------------------------------------------
function buildFilterConditions(projectId, f) {
    const conditions = [eq(tickets.projectId, projectId)];
    // Archived: default hidden; 'only' = archive view; 'true' = include both.
    if (f.archived === 'only') {
        conditions.push(isNotNull(tickets.archivedAt));
    }
    else if (f.archived !== 'true') {
        conditions.push(isNull(tickets.archivedAt));
    }
    if (f.status)
        conditions.push(eq(tickets.status, f.status));
    if (f.priority)
        conditions.push(eq(tickets.priority, f.priority));
    if (f.type)
        conditions.push(eq(tickets.type, f.type));
    if (f.blocked) {
        conditions.push(eq(tickets.isBlocked, f.blocked === 'true'));
    }
    if (f.hasLimitations === 'true')
        conditions.push(isNotNull(tickets.limitations));
    if (f.hasKnownIssues === 'true')
        conditions.push(isNotNull(tickets.knownIssues));
    if (f.hasFollowUps === 'true')
        conditions.push(isNotNull(tickets.followUpNotes));
    // has*: 'false' variants negate.
    if (f.hasLimitations === 'false')
        conditions.push(isNull(tickets.limitations));
    if (f.hasKnownIssues === 'false')
        conditions.push(isNull(tickets.knownIssues));
    if (f.hasFollowUps === 'false')
        conditions.push(isNull(tickets.followUpNotes));
    return conditions;
}
const PRIORITY_ORDER = sql `CASE ${tickets.priority} WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`;
const STATUS_ORDER = sql `CASE ${tickets.status} WHEN 'PLANNED' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'IMPLEMENTED' THEN 2 WHEN 'TESTED' THEN 3 ELSE 4 END`;
export async function searchTickets(projectId, ownerId, filters, sort = {}) {
    await getOwnedProjectOr404Row(projectId, ownerId);
    const db = getDb();
    const conditions = buildFilterConditions(projectId, filters);
    // Free-text search across display ID, title, and the long engineering fields.
    if (filters.q) {
        const term = filters.q.trim();
        // Display ID: TMR-042 / TMR-04 prefix or bare number 42.
        const numberMatch = /(?:^|[-\s])(\d{1,6})$/.exec(term);
        const idLike = `%${term}%`;
        const textColumns = [
            tickets.title,
            tickets.summary,
            tickets.description,
            tickets.motivation,
            tickets.implementationNotes,
            tickets.testingNotes,
            tickets.deploymentNotes,
            tickets.limitations,
            tickets.knownIssues,
            tickets.followUpNotes,
        ];
        const likes = textColumns.map((col) => like(col, idLike));
        likes.push(like(tickets.sourceReference, idLike));
        const searchCondition = numberMatch
            ? or(eq(tickets.ticketNumber, Number(numberMatch[1])), ...likes)
            : or(...likes);
        if (searchCondition)
            conditions.push(searchCondition);
    }
    // Tag filter: tickets attached to the tag whose slug matches.
    if (filters.tag) {
        const tagged = db
            .select({ ticketId: ticketTags.ticketId })
            .from(ticketTags)
            .innerJoin(tagsTable, eq(tagsTable.id, ticketTags.tagId))
            .where(eq(tagsTable.slug, filters.tag));
        conditions.push(inArray(tickets.id, tagged));
    }
    const dir = sort.sortDir === 'desc' ? desc : asc;
    const orderBy = [];
    switch (sort.sortBy) {
        case 'updatedAt':
            orderBy.push(dir(tickets.updatedAt));
            break;
        case 'priority':
            orderBy.push(dir(PRIORITY_ORDER));
            break;
        case 'status':
            orderBy.push(dir(STATUS_ORDER));
            break;
        default:
            orderBy.push(dir(tickets.ticketNumber));
    }
    orderBy.push(asc(tickets.ticketNumber)); // stable tiebreaker
    const rows = await db
        .select({ ticket: tickets, projectKey: projects.projectKey })
        .from(tickets)
        .innerJoin(projects, eq(projects.id, tickets.projectId))
        .where(and(...conditions))
        .orderBy(...orderBy);
    return {
        tickets: rows.map((r) => toDto(r.ticket, r.projectKey)),
        total: rows.length,
    };
}
// PLACEHOLDER_DETAIL
export async function getBoard(projectId, ownerId) {
    const project = await getOwnedProjectOr404Row(projectId, ownerId);
    const db = getDb();
    const rows = await db
        .select({ ticket: tickets, projectKey: projects.projectKey })
        .from(tickets)
        .innerJoin(projects, eq(projects.id, tickets.projectId))
        .where(and(eq(tickets.projectId, projectId), isNull(tickets.archivedAt)))
        .orderBy(desc(tickets.priority), asc(tickets.ticketNumber));
    // Exactly the five lifecycle columns; blocked tickets stay in their lifecycle
    // column (the client renders a BLOCKED badge from isBlocked).
    const columns = BOARD_COLUMN_STATUSES.map((status) => ({
        status,
        tickets: rows
            .filter((r) => r.ticket.status === status)
            .map((r) => toDto(r.ticket, r.projectKey)),
    }));
    return { projectId: project.id, projectKey: project.projectKey, columns };
}
// ---------------------------------------------------------------------------
// Archive / restore + block / unblock — dedicated endpoints over updateTicket.
// Lifecycle status is never touched by these operations.
// ---------------------------------------------------------------------------
export async function setTicketArchived(ticketId, ownerId, archived) {
    const { ticket } = await getOwnedTicketContextOr404(ticketId, ownerId);
    return updateTicket(ticketId, ownerId, { version: ticket.version, archived });
}
// ---------------------------------------------------------------------------
// Direct ticket lookup by project-local number or display ID (Phase 3).
// Owner-scoped; foreign project/ticket → 404. Used for relation click-through
// and display-ID entry (TMR-042 → ticket). Never discloses foreign existence.
// ---------------------------------------------------------------------------
export async function getTicketByNumber(projectId, ownerId, rawNumber) {
    const project = await getOwnedProjectOr404Row(projectId, ownerId);
    // Accept bare "42" or full display ID "TMR-042" (case-insensitive on key).
    let number;
    const display = /^([A-Za-z0-9]+)-0*(\d+)$/.exec(rawNumber.trim());
    if (display) {
        if (display[1].toUpperCase() !== project.projectKey.toUpperCase()) {
            throw ApiError.notFound('Ticket not found');
        }
        number = Number(display[2]);
    }
    else if (/^\d+$/.test(rawNumber.trim())) {
        number = Number(rawNumber.trim());
    }
    else {
        throw ApiError.validation('Invalid ticket number');
    }
    if (!Number.isSafeInteger(number) || number < 1) {
        throw ApiError.validation('Invalid ticket number');
    }
    const rows = await db_readTicket(project.id, number);
    if (!rows)
        throw ApiError.notFound('Ticket not found');
    return rows;
}
async function db_readTicket(projectId, ticketNumber) {
    const db = getDb();
    const rows = await db
        .select({ ticket: tickets, projectKey: projects.projectKey })
        .from(tickets)
        .innerJoin(projects, eq(projects.id, tickets.projectId))
        .where(and(eq(tickets.projectId, projectId), eq(tickets.ticketNumber, ticketNumber)))
        .limit(1);
    const row = rows[0];
    if (!row)
        return null;
    return toDto(row.ticket, row.projectKey);
}
//# sourceMappingURL=tickets.service.js.map