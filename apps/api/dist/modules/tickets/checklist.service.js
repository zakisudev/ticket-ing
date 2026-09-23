import { and, asc, eq } from 'drizzle-orm';
import {} from '@zakisu-tickets/shared';
import { getDb, getPool } from '../../db/client.js';
import { ticketChecklistItems } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import { dbDatetimeToIso, toMysqlDatetime } from '../../lib/dates.js';
import { ApiError } from '../../lib/errors.js';
import { getOwnedTicketContextOr404, insertActivity } from './tickets.service.js';
function toDto(row) {
    return {
        id: row.id,
        ticketId: row.ticketId,
        text: row.text,
        completed: row.completed,
        sortOrder: row.sortOrder,
        createdAt: dbDatetimeToIso(row.createdAt) ?? new Date(0).toISOString(),
        completedAt: dbDatetimeToIso(row.completedAt),
    };
}
/** Checklist rows of an owned ticket, ordered; 404 for foreign/unknown tickets. */
export async function listChecklist(ticketId, ownerId) {
    await getOwnedTicketContextOr404(ticketId, ownerId);
    const db = getDb();
    const rows = await db
        .select()
        .from(ticketChecklistItems)
        .where(eq(ticketChecklistItems.ticketId, ticketId))
        .orderBy(asc(ticketChecklistItems.sortOrder), asc(ticketChecklistItems.createdAt));
    return rows.map(toDto);
}
async function getOwnedItem(ticketId, itemId, ownerId) {
    await getOwnedTicketContextOr404(ticketId, ownerId); // 404 for foreign tickets
    const db = getDb();
    const rows = await db
        .select()
        .from(ticketChecklistItems)
        .where(and(eq(ticketChecklistItems.id, itemId), eq(ticketChecklistItems.ticketId, ticketId)))
        .limit(1);
    const row = rows[0];
    if (!row)
        throw ApiError.notFound('Checklist item not found');
    return { row, ticketVersion: 0 };
}
export async function addChecklistItem(ticketId, ownerId, input) {
    const { projectKey } = await getOwnedTicketContextOr404(ticketId, ownerId);
    void projectKey;
    const conn = await getPool().getConnection();
    let released = false;
    try {
        await conn.beginTransaction();
        // Next sort order = max + 1 within this ticket (transaction is consistent enough
        // for a single-owner tool; UNIQUE constraints not required for ordering).
        const [maxRows] = await conn.query(`SELECT COALESCE(MAX(sort_order), -1) AS maxSort FROM ticket_checklist_items WHERE ticket_id = ?`, [ticketId]);
        const maxSort = Number(maxRows[0].maxSort);
        const id = newId();
        await conn.execute(`INSERT INTO ticket_checklist_items (id, ticket_id, text, completed, sort_order) VALUES (?, ?, ?, FALSE, ?)`, [id, ticketId, input.text, maxSort + 1]);
        await insertActivity(conn, ticketId, ownerId, [
            { type: 'CHECKLIST_ITEM_ADDED', metadata: { itemId: id } },
        ]);
        await conn.commit();
        conn.release();
        released = true;
        const items = await listChecklist(ticketId, ownerId);
        return items.find((i) => i.id === id);
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
export async function updateChecklistItem(ticketId, itemId, ownerId, input) {
    await getOwnedItem(ticketId, itemId, ownerId);
    const conn = await getPool().getConnection();
    let released = false;
    try {
        await conn.beginTransaction();
        const [currentRows] = await conn.execute(`SELECT * FROM ticket_checklist_items WHERE id = ? AND ticket_id = ? FOR UPDATE`, [itemId, ticketId]);
        const current = currentRows[0];
        if (!current)
            throw ApiError.notFound('Checklist item not found');
        const sets = [];
        const params = [];
        const activity = [];
        if (input.text !== undefined && input.text !== current.text) {
            sets.push('text = ?');
            params.push(input.text);
        }
        if (input.completed !== undefined && input.completed !== current.completed) {
            if (input.completed) {
                sets.push('completed = TRUE', 'completed_at = COALESCE(completed_at, ?)');
                params.push(toMysqlDatetime(new Date()));
                activity.push({ type: 'CHECKLIST_ITEM_COMPLETED' });
            }
            else {
                sets.push('completed = FALSE', 'completed_at = NULL');
                activity.push({ type: 'CHECKLIST_ITEM_REOPENED' });
            }
        }
        if (sets.length > 0) {
            await conn.query(`UPDATE ticket_checklist_items SET ${sets.join(', ')} WHERE id = ?`, [...params, itemId]);
        }
        if (activity.length > 0) {
            await insertActivity(conn, ticketId, ownerId, activity);
        }
        await conn.commit();
        conn.release();
        released = true;
        const items = await listChecklist(ticketId, ownerId);
        return items.find((i) => i.id === itemId);
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
export async function deleteChecklistItem(ticketId, itemId, ownerId) {
    await getOwnedItem(ticketId, itemId, ownerId);
    const conn = await getPool().getConnection();
    let released = false;
    try {
        await conn.beginTransaction();
        await conn.execute(`DELETE FROM ticket_checklist_items WHERE id = ?`, [itemId]);
        await insertActivity(conn, ticketId, ownerId, [
            { type: 'CHECKLIST_ITEM_REMOVED', metadata: { itemId } },
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
/** Simple ordered move: swap sort_order with the adjacent sibling. */
export async function reorderChecklistItem(ticketId, itemId, ownerId, input) {
    await getOwnedItem(ticketId, itemId, ownerId);
    const conn = await getPool().getConnection();
    let released = false;
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(`SELECT id, sort_order FROM ticket_checklist_items WHERE ticket_id = ? ORDER BY sort_order ASC, created_at ASC`, [ticketId]);
        const ordered = rows;
        const index = ordered.findIndex((r) => r.id === itemId);
        if (index === -1)
            throw ApiError.notFound('Checklist item not found');
        const swapWith = input.direction === 'up' ? index - 1 : index + 1;
        if (swapWith >= 0 && swapWith < ordered.length) {
            const a = ordered[index];
            const b = ordered[swapWith];
            await conn.execute(`UPDATE ticket_checklist_items SET sort_order = ? WHERE id = ?`, [
                b.sort_order,
                a.id,
            ]);
            await conn.execute(`UPDATE ticket_checklist_items SET sort_order = ? WHERE id = ?`, [
                a.sort_order,
                b.id,
            ]);
        }
        await conn.commit();
        conn.release();
        released = true;
        return listChecklist(ticketId, ownerId);
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
//# sourceMappingURL=checklist.service.js.map