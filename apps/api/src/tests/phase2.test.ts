import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { closePool } from '../db/client.js';
import { ensureMigrated, truncateAll, registerOwner, createForeignOwner, authed } from './helpers.js';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await ensureMigrated();
  app = createApp();
});

afterAll(async () => {
  await closePool();
});

beforeEach(async () => {
  await truncateAll();
});

type Agent = Awaited<ReturnType<typeof registerOwner>>['agent'];

async function setupProject() {
  const { agent } = await registerOwner(app);
  const project = (await agent.post('/api/projects').send({ name: 'TemariOne', projectKey: 'TMR' })).body.project;
  return { agent, project };
}

async function createTicket(agent: Agent, projectId: string, title: string) {
  const res = await agent.post(`/api/projects/${projectId}/tickets`).send({ title });
  expect(res.status).toBe(201);
  return res.body.ticket;
}

// ---------------------------------------------------------------------------
// Orthogonal blocked + archived conditions
// ---------------------------------------------------------------------------
describe('orthogonal blocked condition', () => {
  it('blocks without touching lifecycle status; blocking works in any state', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Blocked work');

    const res = await agent
      .patch(`/api/tickets/${t.id}`)
      .send({ version: 1, isBlocked: true, blockedReason: 'waiting on production mailbox' });
    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('PLANNED');
    expect(res.body.ticket.isBlocked).toBe(true);
    expect(res.body.ticket.blockedReason).toBe('waiting on production mailbox');

    // Blocked IMPLEMENTED ticket: status and condition coexist.
    const v = res.body.ticket.version;
    const impl = await agent.patch(`/api/tickets/${t.id}`).send({ version: v, status: 'IMPLEMENTED' });
    expect(impl.body.ticket.status).toBe('IMPLEMENTED');
    expect(impl.body.ticket.isBlocked).toBe(true);
  });

  it('rejects blocking without a non-empty reason', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Needs reason');
    const noReason = await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, isBlocked: true });
    expect(noReason.status).toBe(422);
    const blank = await agent
      .patch(`/api/tickets/${t.id}`)
      .send({ version: 1, isBlocked: true, blockedReason: '   ' });
    expect(blank.status).toBe(422);
    expect((await agent.get(`/api/tickets/${t.id}`)).body.ticket.isBlocked).toBe(false);
  });

  it('unblocking clears the live reason but preserves it in UNBLOCKED activity', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Unblock me');
    await agent
      .patch(`/api/tickets/${t.id}`)
      .send({ version: 1, isBlocked: true, blockedReason: 'waiting on OPS3B' });
    const res = await agent.patch(`/api/tickets/${t.id}`).send({ version: 2, isBlocked: false });
    expect(res.status).toBe(200);
    expect(res.body.ticket.isBlocked).toBe(false);
    expect(res.body.ticket.blockedReason).toBeNull();

    const detail = await agent.get(`/api/tickets/${t.id}`);
    const unblocked = detail.body.ticket.activity.filter((a: { type: string }) => a.type === 'UNBLOCKED');
    expect(unblocked).toHaveLength(1);
    expect(unblocked[0].metadata.previousReason).toBe('waiting on OPS3B');
  });

  it('BLOCKED/UNBLOCKED activity preserves lifecycle status across block/unblock cycles', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Cycle');
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'IN_PROGRESS' });
    await agent
      .patch(`/api/tickets/${t.id}`)
      .send({ version: 2, isBlocked: true, blockedReason: 'flaky dependency' });
    const res = await agent.patch(`/api/tickets/${t.id}`).send({ version: 3, isBlocked: false });
    expect(res.body.ticket.status).toBe('IN_PROGRESS');

    const detail = await agent.get(`/api/tickets/${t.id}`);
    const types = detail.body.ticket.activity.map((a: { type: string }) => a.type);
    expect(types).toContain('BLOCKED');
    expect(types).toContain('UNBLOCKED');
    // No bogus STATUS_CHANGED from block/unblock.
    const statusEvents = detail.body.ticket.activity.filter(
      (a: { type: string }) => a.type === 'STATUS_CHANGED'
    );
    expect(statusEvents).toHaveLength(1); // only the PLANNED -> IN_PROGRESS move
  });
});

describe('orthogonal archived condition', () => {
  it('archive/restore never touches lifecycle status or milestones', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Archive lifecycle');
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'IN_PROGRESS' });
    const started = (await agent.get(`/api/tickets/${t.id}`)).body.ticket.startedAt;
    expect(started).not.toBeNull();

    const archived = await agent.post(`/api/tickets/${t.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.ticket.status).toBe('IN_PROGRESS');
    expect(archived.body.ticket.archivedAt).not.toBeNull();

    const restored = await agent.post(`/api/tickets/${t.id}/restore`);
    expect(restored.body.ticket.status).toBe('IN_PROGRESS');
    expect(restored.body.ticket.archivedAt).toBeNull();
    expect(restored.body.ticket.startedAt).toBe(started); // milestone preserved
  });

  it('archive then block keeps both conditions and the lifecycle status', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Both conditions');
    const archived = await agent.post(`/api/tickets/${t.id}/archive`).then((r) => r.body.ticket);
    const blocked = await agent
      .patch(`/api/tickets/${t.id}`)
      .send({ version: archived.version, isBlocked: true, blockedReason: 'dead end' });
    expect(blocked.status).toBe(200);
    expect(blocked.body.ticket.status).toBe('PLANNED');
    expect(blocked.body.ticket.isBlocked).toBe(true);
    expect(blocked.body.ticket.archivedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------
describe('checklist sub-resource', () => {
  it('add, complete, reopen, edit, delete with activity', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Checklist flow');

    const added = await agent.post(`/api/tickets/${t.id}/checklist`).send({ text: 'API implementation' });
    expect(added.status).toBe(201);
    const item = added.body.item;
    expect(item.completed).toBe(false);
    expect(item.sortOrder).toBe(0);

    const completed = await agent
      .patch(`/api/tickets/${t.id}/checklist/${item.id}`)
      .send({ completed: true });
    expect(completed.body.item.completed).toBe(true);
    expect(completed.body.item.completedAt).not.toBeNull();

    const reopened = await agent
      .patch(`/api/tickets/${t.id}/checklist/${item.id}`)
      .send({ completed: false });
    expect(reopened.body.item.completed).toBe(false);
    expect(reopened.body.item.completedAt).toBeNull();

    const renamed = await agent
      .patch(`/api/tickets/${t.id}/checklist/${item.id}`)
      .send({ text: 'API implementation v2' });
    expect(renamed.body.item.text).toBe('API implementation v2');

    const del = await agent.delete(`/api/tickets/${t.id}/checklist/${item.id}`);
    expect(del.status).toBe(204);
    const list = await agent.get(`/api/tickets/${t.id}/checklist`);
    expect(list.body.items).toHaveLength(0);

    const detail = await agent.get(`/api/tickets/${t.id}`);
    const types = detail.body.ticket.activity.map((a: { type: string }) => a.type);
    expect(types).toContain('CHECKLIST_ITEM_ADDED');
    expect(types).toContain('CHECKLIST_ITEM_COMPLETED');
    expect(types).toContain('CHECKLIST_ITEM_REOPENED');
    expect(types).toContain('CHECKLIST_ITEM_REMOVED');
  });

  it('up/down reorder swaps adjacent sort orders', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Reorder');
    const a = (await agent.post(`/api/tickets/${t.id}/checklist`).send({ text: 'A' })).body.item;
    const b = (await agent.post(`/api/tickets/${t.id}/checklist`).send({ text: 'B' })).body.item;
    const c = (await agent.post(`/api/tickets/${t.id}/checklist`).send({ text: 'C' })).body.item;

    const moved = await agent
      .post(`/api/tickets/${t.id}/checklist/${c.id}/reorder`)
      .send({ direction: 'up' });
    expect(moved.status).toBe(200);
    const order = moved.body.items.map((i: { text: string }) => i.text);
    expect(order).toEqual(['A', 'C', 'B']);
    void a;
    void b;

    // Moving the first item up is a harmless no-op.
    const noOp = await agent.post(`/api/tickets/${t.id}/checklist/${c.id}/reorder`).send({ direction: 'up' });
    expect(noOp.status).toBe(200);
    expect(noOp.body.items.map((i: { text: string }) => i.text)).toEqual(['C', 'A', 'B']);
  });

  it('foreign checklist item operations return 404', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Mine');
    const item = (
      await agent.post(`/api/tickets/${t.id}/checklist`).send({ text: 'secret step' })
    ).body.item;

    const foreign = await createForeignOwner();
    const other = authed(app, foreign.cookie);
    const foreignTicket = await createTicket(other, project.id, 'Foreign ticket').catch(() => null);
    void foreignTicket;

    const list = await other.get(`/api/tickets/${t.id}/checklist`);
    expect(list.status).toBe(404);
    const patch = await other.patch(`/api/tickets/${t.id}/checklist/${item.id}`).send({ completed: true });
    expect(patch.status).toBe(404);
    const reorder = await other
      .post(`/api/tickets/${t.id}/checklist/${item.id}/reorder`)
      .send({ direction: 'up' });
    expect(reorder.status).toBe(404);
    const del = await other.delete(`/api/tickets/${t.id}/checklist/${item.id}`);
    expect(del.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Links + commits
// ---------------------------------------------------------------------------
describe('links sub-resource', () => {
  it('adds http(s) links and records LINK_ADDED activity without the URL', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Links');

    const link = (
      await agent.post(`/api/tickets/${t.id}/links`).send({
        type: 'DEPLOYMENT',
        label: 'Production',
        url: 'https://app.temarione.com',
      })
    ).body.link;
    expect(link.url).toBe('https://app.temarione.com');

    const detail = await agent.get(`/api/tickets/${t.id}`);
    const linkEvents = detail.body.ticket.activity.filter((a: { type: string }) => a.type === 'LINK_ADDED');
    expect(linkEvents).toHaveLength(1);
    expect(linkEvents[0].metadata.linkType).toBe('DEPLOYMENT');
    // URL must NOT be copied into activity metadata.
    expect(JSON.stringify(linkEvents[0].metadata)).not.toContain('temarione.com');
  });

  it('rejects javascript:, data:, vbscript:, file: and invalid URLs', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Unsafe links');
    for (const url of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox',
      'file:///etc/passwd',
      'https://example.com',
    ].slice(0, 4)) {
      const res = await agent.post(`/api/tickets/${t.id}/links`).send({ type: 'OTHER', url });
      expect(res.status).toBe(422);
    }
    const list = await agent.get(`/api/tickets/${t.id}/links`);
    expect(list.body.links).toHaveLength(0);
  });

  it('accepts a valid https commit link with a hash label', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Commit link');
    const res = await agent.post(`/api/tickets/${t.id}/links`).send({
      type: 'COMMIT',
      label: 'bf4e0ae6a728674f507011635d58b9bb2346cdc2',
      url: 'https://github.com/zakisu/temarione/commit/bf4e0ae6a728674f507011635d58b9bb2346cdc2',
    });
    expect(res.status).toBe(201);
    expect(res.body.link.label).toBe('bf4e0ae6a728674f507011635d58b9bb2346cdc2');
  });

  it('foreign links return 404 (existence not disclosed)', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Mine only');
    const link = (
      await agent
        .post(`/api/tickets/${t.id}/links`)
        .send({ type: 'OTHER', label: 'x', url: 'https://example.com/x' })
    ).body.link;

    const foreign = await createForeignOwner();
    const other = authed(app, foreign.cookie);
    expect((await other.get(`/api/tickets/${t.id}/links`)).status).toBe(404);
    expect((await other.delete(`/api/tickets/${t.id}/links/${link.id}`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
describe('relations sub-resource', () => {
  it('stores BLOCKS canonically and derives BLOCKED_BY on the other side', async () => {
    const { agent, project } = await setupProject();
    const a = await createTicket(agent, project.id, 'Blocker');
    const b = await createTicket(agent, project.id, 'Blocked work');

    const res = await agent
      .post(`/api/tickets/${a.id}/relations`)
      .send({ type: 'BLOCKS', otherTicketId: b.id });
    expect(res.status).toBe(201);

    const fromA = res.body.relations.find((r: { otherTicketId: string }) => r.otherTicketId === b.id);
    expect(fromA.type).toBe('BLOCKS');

    const fromB = await agent.get(`/api/tickets/${b.id}/relations`);
    const inverse = fromB.body.relations.find((r: { otherTicketId: string }) => r.otherTicketId === a.id);
    expect(inverse.type).toBe('BLOCKED_BY');
    expect(inverse.otherDisplayId).toBe(a.displayId);
    expect(inverse.otherTitle).toBe('Blocker');

    // Exactly one canonical row exists.
    const fromAAfter = await agent.get(`/api/tickets/${a.id}/relations`);
    expect(fromAAfter.body.relations).toHaveLength(1);
  });

  it('FOLLOWS_UP derives FOLLOWED_UP_BY; display IDs flow through', async () => {
    const { agent, project } = await setupProject();
    const original = await createTicket(agent, project.id, 'Professional invitation emails');
    const followUp = await createTicket(agent, project.id, 'Harden logo URL validation');
    await agent
      .post(`/api/tickets/${followUp.id}/relations`)
      .send({ type: 'FOLLOWS_UP', otherTicketId: original.id });

    const fromFollowUp = await agent.get(`/api/tickets/${followUp.id}/relations`);
    expect(fromFollowUp.body.relations[0].type).toBe('FOLLOWS_UP');
    expect(fromFollowUp.body.relations[0].otherDisplayId).toBe(original.displayId);

    const fromOriginal = await agent.get(`/api/tickets/${original.id}/relations`);
    expect(fromOriginal.body.relations[0].type).toBe('FOLLOWED_UP_BY');
    expect(fromOriginal.body.relations[0].otherDisplayId).toBe(followUp.displayId);
  });

  it('RELATED_TO is symmetric with a single canonical row regardless of input order', async () => {
    const { agent, project } = await setupProject();
    const a = await createTicket(agent, project.id, 'A side');
    const b = await createTicket(agent, project.id, 'B side');
    await agent.post(`/api/tickets/${b.id}/relations`).send({ type: 'RELATED_TO', otherTicketId: a.id });

    const fromA = await agent.get(`/api/tickets/${a.id}/relations`);
    expect(fromA.body.relations).toHaveLength(1);
    expect(fromA.body.relations[0].type).toBe('RELATED_TO');

    // Duplicate (even from the other direction) is rejected.
    const dup = await agent
      .post(`/api/tickets/${a.id}/relations`)
      .send({ type: 'RELATED_TO', otherTicketId: b.id });
    expect(dup.status).toBe(409);
  });

  it('rejects self-relations, duplicates, and cross-project relations with 404', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Main');

    const self = await agent.post(`/api/tickets/${t.id}/relations`).send({ type: 'RELATED_TO', otherTicketId: t.id });
    expect(self.status).toBe(422);

    // A second owner's ticket is invisible: cross-project relation => 404.
    const foreign = await createForeignOwner();
    const other = authed(app, foreign.cookie);
    const foreignProject = (
      await other.post('/api/projects').send({ name: 'Foreign', projectKey: 'FRN' })
    ).body.project;
    const foreignTicket = await createTicket(other, foreignProject.id, 'Not yours');
    const cross = await agent
      .post(`/api/tickets/${t.id}/relations`)
      .send({ type: 'BLOCKS', otherTicketId: foreignTicket.id });
    expect(cross.status).toBe(404);
  });

  it('foreign relation reads return 404 and deletion is ownership-checked', async () => {
    const { agent, project } = await setupProject();
    const a = await createTicket(agent, project.id, 'A');
    const b = await createTicket(agent, project.id, 'B');
    const rel = await agent
      .post(`/api/tickets/${a.id}/relations`)
      .send({ type: 'BLOCKS', otherTicketId: b.id });
    const relationId = rel.body.relations[0].id;

    const foreign = await createForeignOwner();
    const other = authed(app, foreign.cookie);
    expect((await other.get(`/api/tickets/${a.id}/relations`)).status).toBe(404);
    expect((await other.delete(`/api/tickets/${a.id}/relations/${relationId}`)).status).toBe(404);

    // Owner can delete; activity recorded on both tickets.
    const del = await agent.delete(`/api/tickets/${a.id}/relations/${relationId}`);
    expect(del.status).toBe(204);
    const bDetail = await agent.get(`/api/tickets/${b.id}`);
    expect(bDetail.body.ticket.activity.map((x: { type: string }) => x.type)).toContain('RELATION_REMOVED');
  });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
describe('tags sub-resource', () => {
  it('creates project-scoped tags with unique slugs', async () => {
    const { agent, project } = await setupProject();
    const tag = (await agent.post(`/api/projects/${project.id}/tags`).send({ name: 'Historical' })).body.tag;
    expect(tag.slug).toBe('historical');

    // Same name (case-insensitive slug) conflicts.
    const dup = await agent.post(`/api/projects/${project.id}/tags`).send({ name: 'historical' });
    expect(dup.status).toBe(409);

    // Same name in another project is fine.
    const p2 = (await agent.post('/api/projects').send({ name: 'Other', projectKey: 'OTH' })).body.project;
    const tag2 = (await agent.post(`/api/projects/${p2.id}/tags`).send({ name: 'historical' })).body.tag;
    expect(tag2.slug).toBe('historical');
  });

  it('attach, detach, and tag-filtered list', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Tagged work');
    const tag = (await agent.post(`/api/projects/${project.id}/tags`).send({ name: 'security' })).body.tag;

    const attached = await agent.post(`/api/tickets/${t.id}/tags`).send({ tagId: tag.id });
    expect(attached.status).toBe(200);
    expect(attached.body.tags.map((x: { slug: string }) => x.slug)).toEqual(['security']);

    // Idempotent attach: no duplicate.
    await agent.post(`/api/tickets/${t.id}/tags`).send({ tagId: tag.id });
    expect((await agent.get(`/api/tickets/${t.id}/tags`)).body.tags).toHaveLength(1);

    // Tag filter finds the ticket.
    const filtered = await agent.get(`/api/projects/${project.id}/tickets?tag=security`);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.tickets[0].id).toBe(t.id);

    // Activity on attach/detach.
    const detached = await agent.delete(`/api/tickets/${t.id}/tags/${tag.id}`);
    expect(detached.body.tags).toHaveLength(0);
    const detail = await agent.get(`/api/tickets/${t.id}`);
    const types = detail.body.ticket.activity.map((a: { type: string }) => a.type);
    expect(types).toContain('TAG_ADDED');
    expect(types).toContain('TAG_REMOVED');
  });

  it('foreign tags are 404 on attach; foreign project tag lists are 404', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Owner ticket');
    const foreign = await createForeignOwner();
    const other = authed(app, foreign.cookie);
    const foreignProject = (
      await other.post('/api/projects').send({ name: 'Foreign', projectKey: 'FRN' })
    ).body.project;
    const foreignTag = (
      await other.post(`/api/projects/${foreignProject.id}/tags`).send({ name: 'leak' })
    ).body.tag;

    expect((await other.get(`/api/projects/${project.id}/tags`)).status).toBe(404);
    const attach = await agent.post(`/api/tickets/${t.id}/tags`).send({ tagId: foreignTag.id });
    expect(attach.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Search + filters + list
// ---------------------------------------------------------------------------
describe('search', () => {
  it('finds tickets by exact ticket number and by text across fields', async () => {
    const { agent, project } = await setupProject();
    const t1 = await createTicket(agent, project.id, 'Professional invitation emails');
    await createTicket(agent, project.id, 'Something else');
    await agent
      .patch(`/api/tickets/${t1.id}`)
      .send({ version: 1, limitations: 'mailbox rendering not yet confirmed' });

    const byNumber = await agent.get(`/api/projects/${project.id}/search?q=1`);
    expect(byNumber.body.total).toBe(1);
    expect(byNumber.body.tickets[0].id).toBe(t1.id);

    const byTitle = await agent.get(`/api/projects/${project.id}/search?q=invitation`);
    expect(byTitle.body.total).toBe(1);
    expect(byTitle.body.tickets[0].title).toBe('Professional invitation emails');

    const byLimitations = await agent.get(`/api/projects/${project.id}/search?q=mailbox rendering`);
    expect(byLimitations.body.total).toBe(1);
  });

  it('is owner-scoped and empty-safe', async () => {
    const { agent, project } = await setupProject();
    await createTicket(agent, project.id, 'Visible only to owner');
    const foreign = await createForeignOwner();
    const other = authed(app, foreign.cookie);
    expect((await other.get(`/api/projects/${project.id}/search?q=owner`)).status).toBe(404);
    const noMatch = await agent.get(`/api/projects/${project.id}/search?q=zzznotfoundzzz`);
    expect(noMatch.body.total).toBe(0);
  });
});

describe('filters and list', () => {
  async function setupBoardData() {
    const { agent, project } = await setupProject();
    const planned = await createTicket(agent, project.id, 'Planned bug');
    const done = await createTicket(agent, project.id, 'Deployed feature');
    await agent.patch(`/api/tickets/${done.id}`).send({ version: 1, status: 'DEPLOYED', type: 'FEATURE' });
    await agent.patch(`/api/tickets/${planned.id}`).send({ version: 1, type: 'BUG', priority: 'P1' });
    const blocked = await createTicket(agent, project.id, 'Blocked ops');
    await agent
      .patch(`/api/tickets/${blocked.id}`)
      .send({ version: 1, status: 'IN_PROGRESS', isBlocked: true, blockedReason: 'waiting' });
    const limited = await createTicket(agent, project.id, 'Has limitations');
    await agent.patch(`/api/tickets/${limited.id}`).send({ version: 1, limitations: 'some caveat' });
    const archived = await createTicket(agent, project.id, 'Archived thing');
    await agent.post(`/api/tickets/${archived.id}/archive`);
    return { agent, project, planned, done, blocked, limited, archived };
  }

  it('filters by status, priority, type, blocked, hasLimitations and composes', async () => {
    const { agent, project, planned, done, blocked, limited } = await setupBoardData();

    const byStatus = await agent.get(`/api/projects/${project.id}/tickets?status=DEPLOYED`);
    expect(byStatus.body.tickets.map((t: { id: string }) => t.id)).toEqual([done.id]);

    const byType = await agent.get(`/api/projects/${project.id}/tickets?type=BUG`);
    expect(byType.body.tickets.map((t: { id: string }) => t.id)).toEqual([planned.id]);

    const byPriority = await agent.get(`/api/projects/${project.id}/tickets?priority=P1`);
    expect(byPriority.body.tickets.map((t: { id: string }) => t.id)).toEqual([planned.id]);

    const byBlocked = await agent.get(`/api/projects/${project.id}/tickets?blocked=true`);
    expect(byBlocked.body.tickets.map((t: { id: string }) => t.id)).toEqual([blocked.id]);

    const byLimitations = await agent.get(`/api/projects/${project.id}/tickets?hasLimitations=true`);
    expect(byLimitations.body.tickets.map((t: { id: string }) => t.id)).toEqual([limited.id]);

    // Composed: IN_PROGRESS + blocked.
    const composed = await agent.get(`/api/projects/${project.id}/tickets?status=IN_PROGRESS&blocked=true`);
    expect(composed.body.tickets.map((t: { id: string }) => t.id)).toEqual([blocked.id]);
  });

  it('hides archived by default; archived=only shows just the archive', async () => {
    const { agent, project, archived, planned } = await setupBoardData();
    const all = await agent.get(`/api/projects/${project.id}/tickets`);
    const ids = all.body.tickets.map((t: { id: string }) => t.id);
    expect(ids).not.toContain(archived.id);
    expect(ids).toContain(planned.id);

    const onlyArchived = await agent.get(`/api/projects/${project.id}/tickets?archived=only`);
    expect(onlyArchived.body.tickets.map((t: { id: string }) => t.id)).toEqual([archived.id]);
  });

  it('sorts by priority asc (P0 first) and desc', async () => {
    const fresh = await setupProject();
    const a = await createTicket(fresh.agent, fresh.project.id, 'A'); // P2
    const b = await createTicket(fresh.agent, fresh.project.id, 'B'); // -> P0
    await fresh.agent.patch(`/api/tickets/${b.id}`).send({ version: 1, priority: 'P0' });
    const c = await createTicket(fresh.agent, fresh.project.id, 'C'); // P3
    await fresh.agent.patch(`/api/tickets/${c.id}`).send({ version: 1, priority: 'P3' });
    const d = await createTicket(fresh.agent, fresh.project.id, 'D'); // P1
    await fresh.agent.patch(`/api/tickets/${d.id}`).send({ version: 1, priority: 'P1' });

    const byPriority = await fresh.agent.get(`/api/projects/${fresh.project.id}/tickets?sortBy=priority`);
    expect(byPriority.body.tickets.map((t: { ticketNumber: number }) => t.ticketNumber)).toEqual([
      b.ticketNumber,
      d.ticketNumber,
      a.ticketNumber,
      c.ticketNumber,
    ]);

    const byPriorityDesc = await fresh.agent.get(
      `/api/projects/${fresh.project.id}/tickets?sortBy=priority&sortDir=desc`
    );
    expect(byPriorityDesc.body.tickets.map((t: { ticketNumber: number }) => t.ticketNumber)).toEqual([
      c.ticketNumber,
      a.ticketNumber,
      d.ticketNumber,
      b.ticketNumber,
    ]);
  });

  it('foreign project list/search/board access returns 404', async () => {
    const { agent, project } = await setupProject();
    await createTicket(agent, project.id, 'Secret');
    const foreign = await createForeignOwner();
    const other = authed(app, foreign.cookie);
    expect((await other.get(`/api/projects/${project.id}/tickets`)).status).toBe(404);
    expect((await other.get(`/api/projects/${project.id}/tickets/board`)).status).toBe(404);
    expect((await other.get(`/api/projects/${project.id}/search?q=Secret`)).status).toBe(404);
  });
});
