import { and, eq, or } from 'drizzle-orm';
import { displayTicketId, } from '@zakisu-tickets/shared';
import { getDb, getPool } from '../../db/client.js';
import { projects, ticketRelations, tickets } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import { dbDatetimeToIso } from '../../lib/dates.js';
import { ApiError } from '../../lib/errors.js';
import { getOwnedTicketContextOr404, insertActivity } from './tickets.service.js';
/**
 * Relations are stored as ONE canonical row; the inverse direction is derived
 * at read time (BLOCKED_BY is never persisted — it is the derived inverse of
 * BLOCKS). RELATED_TO is symmetric: whichever direction is created first
 * becomes the canonical row.
 */
export async function listRelations(ticketId, ownerId) {
    const { projectKey } = await getOwnedTicketContextOr404(ticketId, ownerId);
    const db = getDb();
    // Match either endpoint so the stored relation can be presented in both directions.
    const relationEndpoint = or(eq(ticketRelations.relatedTicketId, tickets.id), eq(ticketRelations.ticketId, tickets.id));
    const rows = await db
        .select({ relation: ticketRelations, other: tickets })
        .from(ticketRelations)
        .innerJoin(tickets, relationEndpoint)
        .innerJoin(projects, eq(projects.id, tickets.projectId))
        .where(and(eq(projects.ownerId, ownerId), or(eq(ticketRelations.ticketId, ticketId), eq(ticketRelations.relatedTicketId, ticketId))));
    return rows
        .filter((row) => row.other.id !== ticketId)
        .map((row) => {
        const stored = row.relation;
        // Is the stored row's "from" this ticket (forward) or the other ticket (inverse)?
        const forward = stored.ticketId === ticketId;
        let presentationType = stored.type;
        if (!forward) {
            presentationType =
                stored.type === 'BLOCKS'
                    ? 'BLOCKED_BY'
                    : stored.type === 'FOLLOWS_UP'
                        ? 'FOLLOWED_UP_BY'
                        : 'RELATED_TO';
        }
        return {
            id: stored.id,
            ticketId,
            type: presentationType,
            otherTicketId: row.other.id,
            otherDisplayId: displayTicketId(projectKey, row.other.ticketNumber),
            otherTitle: row.other.title,
            otherStatus: row.other.status,
            createdAt: dbDatetimeToIso(stored.createdAt) ?? new Date(0).toISOString(),
        };
    })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export async function addRelation(ticketId, ownerId, input) {
    const self = await getOwnedTicketContextOr404(ticketId, ownerId);
    if (input.otherTicketId === ticketId) {
        throw ApiError.validation('A ticket cannot relate to itself');
    }
    const other = await getOwnedTicketContextOr404(input.otherTicketId, ownerId);
    if (other.ticket.projectId !== self.ticket.projectId) {
        // Cross-project relations are out of scope for V1 (404 — do not disclose).
        throw ApiError.notFound('Ticket not found');
    }
    // Canonical storage order for symmetric types: lower UUID first, so both
    // directions of a duplicate always collide on the same canonical row.
    const symmetric = input.type === 'RELATED_TO';
    const canonical = (() => {
        if (!symmetric) {
            return {
                from: ticketId,
                to: input.otherTicketId,
                type: input.type,
            };
        }
        return ticketId < input.otherTicketId
            ? { from: ticketId, to: input.otherTicketId, type: 'RELATED_TO' }
            : { from: input.otherTicketId, to: ticketId, type: 'RELATED_TO' };
    })();
    // Duplicate / inverse-duplicate detection with friendly errors.
    const db = getDb();
    const existingRows = await db
        .select()
        .from(ticketRelations)
        .where(or(and(eq(ticketRelations.ticketId, canonical.from), eq(ticketRelations.relatedTicketId, canonical.to)), and(eq(ticketRelations.ticketId, canonical.to), eq(ticketRelations.relatedTicketId, canonical.from))));
    const conflict = existingRows.find((r) => r.type === canonical.type || (canonical.type === 'RELATED_TO' && r.type === 'RELATED_TO'));
    if (conflict) {
        throw ApiError.conflict('This relation already exists');
    }
    const conn = await getPool().getConnection();
    let released = false;
    try {
        await conn.beginTransaction();
        await conn.execute(`INSERT INTO ticket_relations (id, ticket_id, related_ticket_id, type) VALUES (?, ?, ?, ?)`, [newId(), canonical.from, canonical.to, canonical.type]);
        // Activity on BOTH tickets; metadata carries ids/types only.
        await insertActivity(conn, ticketId, ownerId, [
            {
                type: 'RELATION_ADDED',
                metadata: { relationType: input.type, otherTicketId: input.otherTicketId },
            },
        ]);
        await insertActivity(conn, input.otherTicketId, ownerId, [
            {
                type: 'RELATION_ADDED',
                metadata: { relationType: input.type, otherTicketId: ticketId },
            },
        ]);
        await conn.commit();
        conn.release();
        released = true;
        return listRelations(ticketId, ownerId);
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
export async function deleteRelation(ticketId, relationId, ownerId) {
    await getOwnedTicketContextOr404(ticketId, ownerId);
    const db = getDb();
    const rows = await db
        .select()
        .from(ticketRelations)
        .where(eq(ticketRelations.id, relationId))
        .limit(1);
    const row = rows[0];
    // 404 when the relation does not involve an owned ticket — never disclose.
    if (!row || (row.ticketId !== ticketId && row.relatedTicketId !== ticketId)) {
        throw ApiError.notFound('Relation not found');
    }
    // Both endpoints must be owned by the same owner.
    const both = await Promise.all([
        getOwnedTicketContextOr404(row.ticketId, ownerId),
        getOwnedTicketContextOr404(row.relatedTicketId, ownerId),
    ]);
    void both;
    const conn = await getPool().getConnection();
    let released = false;
    try {
        await conn.beginTransaction();
        await conn.execute(`DELETE FROM ticket_relations WHERE id = ?`, [relationId]);
        const otherTicketId = row.ticketId === ticketId ? row.relatedTicketId : row.ticketId;
        await insertActivity(conn, ticketId, ownerId, [
            { type: 'RELATION_REMOVED', metadata: { otherTicketId } },
        ]);
        await insertActivity(conn, otherTicketId, ownerId, [
            { type: 'RELATION_REMOVED', metadata: { otherTicketId: ticketId } },
        ]);
        await conn.commit();
        conn.release();
        released = true;
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
//# sourceMappingURL=relations.service.js.map