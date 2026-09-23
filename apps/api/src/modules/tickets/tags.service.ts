import { and, asc, eq } from 'drizzle-orm';
import {
  type CreateTagInput,
  type TagDto,
} from '@zakisu-tickets/shared';
import { tagSlugify } from '@zakisu-tickets/shared';
import { getDb, getPool } from '../../db/client.js';
import { projects, tags, ticketTags } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import { ApiError } from '../../lib/errors.js';
import { getOwnedTicketContextOr404, insertActivity } from './tickets.service.js';

type TagRow = typeof tags.$inferSelect;

function toDto(row: TagRow): TagDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    slug: row.slug,
    color: row.color ?? null,
  };
}

/** Resolve an owned project row; 404 for foreign/unknown projects. */
async function getOwnedProject(projectId: string, ownerId: string) {
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

export async function listProjectTags(projectId: string, ownerId: string): Promise<TagDto[]> {
  await getOwnedProject(projectId, ownerId);
  const db = getDb();
  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.projectId, projectId))
    .orderBy(asc(tags.name));
  return rows.map(toDto);
}

export async function createTag(
  projectId: string,
  ownerId: string,
  input: CreateTagInput
): Promise<TagDto> {
  await getOwnedProject(projectId, ownerId);
  const slug = tagSlugify(input.name);
  const id = newId();
  try {
    const conn = await getPool().getConnection();
    let released = false;
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO tags (id, project_id, name, slug, color) VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, input.name, slug, input.color ?? null]
      );
      await conn.commit();
      conn.release();
      released = true;
    } catch (err) {
      if (!released) await conn.rollback();
      throw err;
    } finally {
      if (!released) conn.release();
    }
  } catch (err) {
    // ER_DUP_ENTRY (wrapped by drizzle in err.cause) => tag slug exists in project.
    const cause = (err as { cause?: { code?: string } }).cause;
    if (cause?.code === 'ER_DUP_ENTRY' || (err as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw ApiError.conflict('A tag with this name already exists in the project');
    }
    throw err;
  }
  const list = await listProjectTags(projectId, ownerId);
  return list.find((t) => t.id === id)!;
}

export async function deleteTag(projectId: string, tagId: string, ownerId: string): Promise<void> {
  await getOwnedProject(projectId, ownerId);
  const db = getDb();
  const rows = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.projectId, projectId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw ApiError.notFound('Tag not found');
  const conn = await getPool().getConnection();
  let released = false;
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM ticket_tags WHERE tag_id = ?`, [tagId]);
    await conn.execute(`DELETE FROM tags WHERE id = ?`, [tagId]);
    await conn.commit();
    conn.release();
    released = true;
  } catch (err) {
    if (!released) await conn.rollback();
    throw err;
  } finally {
    if (!released) conn.release();
  }
}

/** Tags currently attached to an owned ticket. */
export async function listTicketTags(ticketId: string, ownerId: string): Promise<TagDto[]> {
  const { ticket } = await getOwnedTicketContextOr404(ticketId, ownerId);
  const db = getDb();
  const rows = await db
    .select({ tag: tags })
    .from(ticketTags)
    .innerJoin(tags, eq(tags.id, ticketTags.tagId))
    .where(eq(ticketTags.ticketId, ticketId))
    .orderBy(asc(tags.name));
  void ticket;
  return rows.map((r) => toDto(r.tag));
}

export async function attachTag(
  ticketId: string,
  ownerId: string,
  tagId: string
): Promise<TagDto[]> {
  const { ticket } = await getOwnedTicketContextOr404(ticketId, ownerId);
  const db = getDb();
  const tagRows = await db.select().from(tags).where(eq(tags.id, tagId)).limit(1);
  const tag = tagRows[0];
  // Foreign/unknown tag => 404 (tag existence is owner-scoped information).
  if (!tag || tag.projectId !== ticket.projectId) {
    throw ApiError.notFound('Tag not found');
  }
  const conn = await getPool().getConnection();
  let released = false;
  try {
    await conn.beginTransaction();
    // Idempotent attach: INSERT IGNORE semantics via ON DUPLICATE KEY.
    await conn.execute(
      `INSERT INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE tag_id = tag_id`,
      [ticketId, tagId]
    );
    await insertActivity(conn, ticketId, ownerId, [
      { type: 'TAG_ADDED', metadata: { tagId, tagSlug: tag.slug } },
    ]);
    await conn.commit();
    conn.release();
    released = true;
    return listTicketTags(ticketId, ownerId);
  } catch (err) {
    if (!released) await conn.rollback();
    throw err;
  } finally {
    if (!released) conn.release();
  }
}

export async function detachTag(
  ticketId: string,
  ownerId: string,
  tagId: string
): Promise<TagDto[]> {
  const { ticket } = await getOwnedTicketContextOr404(ticketId, ownerId);
  void ticket;
  const db = getDb();
  const tagRows = await db
    .select({ tag: tags })
    .from(ticketTags)
    .innerJoin(tags, eq(tags.id, ticketTags.tagId))
    .where(and(eq(ticketTags.ticketId, ticketId), eq(ticketTags.tagId, tagId)))
    .limit(1);
  const tag = tagRows[0]?.tag;
  if (!tag) throw ApiError.notFound('Tag not found');
  const conn = await getPool().getConnection();
  let released = false;
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM ticket_tags WHERE ticket_id = ? AND tag_id = ?`, [
      ticketId,
      tagId,
    ]);
    await insertActivity(conn, ticketId, ownerId, [
      { type: 'TAG_REMOVED', metadata: { tagId, tagSlug: tag.slug } },
    ]);
    await conn.commit();
    conn.release();
    released = true;
    return listTicketTags(ticketId, ownerId);
  } catch (err) {
    if (!released) await conn.rollback();
    throw err;
  } finally {
    if (!released) conn.release();
  }
}
