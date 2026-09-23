import { and, eq } from 'drizzle-orm';
import {} from '@zakisu-tickets/shared';
import { getDb, getPool } from '../../db/client.js';
import { ticketLinks } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import { dbDatetimeToIso } from '../../lib/dates.js';
import { ApiError } from '../../lib/errors.js';
import { getOwnedTicketContextOr404, insertActivity } from './tickets.service.js';
function toDto(row) {
    return {
        id: row.id,
        ticketId: row.ticketId,
        type: row.type,
        label: row.label ?? null,
        url: row.url,
        createdAt: dbDatetimeToIso(row.createdAt) ?? new Date(0).toISOString(),
    };
}
/**
 * Shortened git commit hash for display: 7 hex chars when the label looks like
 * a full or long hash. The full value stays stored; only presentation shortens.
 */
export function shortCommitHash(label) {
    if (!label)
        return null;
    return /^[0-9a-f]{8,40}$/i.test(label.trim()) ? label.trim().slice(0, 7) : null;
}
export async function listLinks(ticketId, ownerId) {
    await getOwnedTicketContextOr404(ticketId, ownerId);
    const db = getDb();
    const rows = await db.select().from(ticketLinks).where(eq(ticketLinks.ticketId, ticketId));
    return rows
        .map(toDto)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export async function addLink(ticketId, ownerId, input) {
    await getOwnedTicketContextOr404(ticketId, ownerId); // 404 for foreign tickets
    // Defense in depth: the shared Zod schema already enforces http(s); re-check
    // at the service boundary so no other caller can bypass it.
    let protocol = '';
    try {
        protocol = new URL(input.url).protocol;
    }
    catch {
        throw ApiError.validation('Invalid URL');
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
        throw ApiError.validation('Only http(s) URLs are allowed');
    }
    if (input.type === 'COMMIT' && !input.label) {
        throw ApiError.validation('Commit links need the commit hash as label');
    }
    const id = newId();
    const conn = await getPool().getConnection();
    let released = false;
    try {
        await conn.beginTransaction();
        await conn.execute(`INSERT INTO ticket_links (id, ticket_id, type, label, url) VALUES (?, ?, ?, ?, ?)`, [id, ticketId, input.type, input.label ?? null, input.url]);
        // Activity metadata carries safe facts only: type + label, never the URL
        // (query strings could embed tokens).
        await insertActivity(conn, ticketId, ownerId, [
            { type: 'LINK_ADDED', metadata: { linkId: id, linkType: input.type, label: input.label ?? null } },
        ]);
        await conn.commit();
        conn.release();
        released = true;
        const links = await listLinks(ticketId, ownerId);
        return links.find((l) => l.id === id);
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
export async function deleteLink(ticketId, linkId, ownerId) {
    await getOwnedTicketContextOr404(ticketId, ownerId);
    const db = getDb();
    const rows = await db
        .select()
        .from(ticketLinks)
        .where(and(eq(ticketLinks.id, linkId), eq(ticketLinks.ticketId, ticketId)))
        .limit(1);
    const row = rows[0];
    if (!row)
        throw ApiError.notFound('Link not found');
    const conn = await getPool().getConnection();
    let released = false;
    try {
        await conn.beginTransaction();
        await conn.execute(`DELETE FROM ticket_links WHERE id = ?`, [linkId]);
        await insertActivity(conn, ticketId, ownerId, [
            { type: 'LINK_REMOVED', metadata: { linkId, linkType: row.type, label: row.label ?? null } },
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
//# sourceMappingURL=links.service.js.map