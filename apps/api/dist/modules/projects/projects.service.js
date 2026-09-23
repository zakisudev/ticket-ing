import { and, asc, count, eq } from 'drizzle-orm';
import { slugify } from '@zakisu-tickets/shared';
import { getDb } from '../../db/client.js';
import { projects, tickets } from '../../db/schema.js';
import { newId } from '../../lib/ids.js';
import { dbDatetimeToIso, toMysqlDatetime } from '../../lib/dates.js';
import { ApiError } from '../../lib/errors.js';
function toDto(row, ticketCount = 0) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        projectKey: row.projectKey,
        description: row.description ?? null,
        color: row.color ?? null,
        icon: row.icon ?? null,
        repositoryUrl: row.repositoryUrl ?? null,
        stagingUrl: row.stagingUrl ?? null,
        productionUrl: row.productionUrl ?? null,
        ticketCount,
        archived: row.archivedAt != null,
        archivedAt: dbDatetimeToIso(row.archivedAt),
        createdAt: dbDatetimeToIso(row.createdAt) ?? new Date(0).toISOString(),
        updatedAt: dbDatetimeToIso(row.updatedAt) ?? new Date(0).toISOString(),
    };
}
/** Resolves a project owned by the user or throws 404 (existence never leaked). */
export async function getOwnedProjectOr404(projectId, ownerId) {
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
async function ticketCountFor(projectId) {
    const db = getDb();
    const [row] = await db
        .select({ value: count() })
        .from(tickets)
        .where(eq(tickets.projectId, projectId));
    return Number(row?.value ?? 0);
}
async function uniqueSlug(ownerId, name) {
    const db = getDb();
    const base = slugify(name);
    let candidate = base;
    let n = 2;
    // Small owner-scoped namespace; probing is fine at this scale.
    for (;;) {
        const existing = await db
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.ownerId, ownerId), eq(projects.slug, candidate)))
            .limit(1);
        if (existing.length === 0)
            return candidate;
        candidate = `${base}-${n}`;
        n += 1;
    }
}
export async function createProject(ownerId, input) {
    const slug = await uniqueSlug(ownerId, input.name);
    const id = newId();
    const db = getDb();
    await db
        .insert(projects)
        .values({
        id,
        ownerId,
        name: input.name,
        slug,
        projectKey: input.projectKey,
        description: input.description ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        repositoryUrl: input.repositoryUrl ?? null,
        stagingUrl: input.stagingUrl ?? null,
        productionUrl: input.productionUrl ?? null,
    });
    const created = await getOwnedProjectOr404(id, ownerId);
    return toDto(created, 0);
}
export async function listProjects(ownerId, includeArchived) {
    const db = getDb();
    const rows = await db
        .select()
        .from(projects)
        .where(includeArchived
        ? eq(projects.ownerId, ownerId)
        : and(eq(projects.ownerId, ownerId)))
        .orderBy(asc(projects.name));
    const counts = await db
        .select({ projectId: tickets.projectId, value: count() })
        .from(tickets)
        .innerJoin(projects, eq(projects.id, tickets.projectId))
        .where(eq(projects.ownerId, ownerId))
        .groupBy(tickets.projectId);
    const countMap = new Map(counts.map((c) => [c.projectId, Number(c.value)]));
    return rows
        .filter((r) => includeArchived || r.archivedAt == null)
        .map((r) => toDto(r, countMap.get(r.id) ?? 0));
}
export async function getProject(projectId, ownerId) {
    const row = await getOwnedProjectOr404(projectId, ownerId);
    return toDto(row, await ticketCountFor(projectId));
}
export async function updateProject(projectId, ownerId, input) {
    const existing = await getOwnedProjectOr404(projectId, ownerId);
    const db = getDb();
    if (input.projectKey !== undefined && input.projectKey !== existing.projectKey) {
        // Display IDs derive from the current key; lock it once tickets exist.
        const [row] = await db
            .select({ value: count() })
            .from(tickets)
            .where(eq(tickets.projectId, projectId));
        if (Number(row?.value ?? 0) > 0) {
            throw ApiError.conflict('Project key is immutable once tickets exist');
        }
    }
    await db
        .update(projects)
        .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.projectKey !== undefined ? { projectKey: input.projectKey } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.repositoryUrl !== undefined ? { repositoryUrl: input.repositoryUrl } : {}),
        ...(input.stagingUrl !== undefined ? { stagingUrl: input.stagingUrl } : {}),
        ...(input.productionUrl !== undefined ? { productionUrl: input.productionUrl } : {}),
    })
        .where(eq(projects.id, projectId));
    const updated = await getOwnedProjectOr404(projectId, ownerId);
    return toDto(updated, await ticketCountFor(projectId));
}
export async function setProjectArchived(projectId, ownerId, archived) {
    await getOwnedProjectOr404(projectId, ownerId);
    const db = getDb();
    await db
        .update(projects)
        .set({ archivedAt: archived ? toMysqlDatetime(new Date()) : null })
        .where(eq(projects.id, projectId));
    const updated = await getOwnedProjectOr404(projectId, ownerId);
    return toDto(updated, await ticketCountFor(projectId));
}
//# sourceMappingURL=projects.service.js.map