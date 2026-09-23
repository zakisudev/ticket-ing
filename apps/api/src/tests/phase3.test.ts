import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closePool } from '../db/client.js';
import {
  ensureMigrated,
  truncateAll,
  registerOwner,
  createForeignOwner,
  authed,
} from './helpers.js';

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

async function setupProject(name = 'TemariOne', projectKey = 'TMR') {
  const { agent } = await registerOwner(app);
  const project = (await agent.post('/api/projects').send({ name, projectKey })).body.project;
  return { agent, project };
}

async function createTicket(
  agent: Agent,
  projectId: string,
  title: string,
  extra: Record<string, unknown> = {},
) {
  const res = await agent.post(`/api/projects/${projectId}/tickets`).send({ title, ...extra });
  expect(res.status).toBe(201);
  return res.body.ticket;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
describe('project dashboard', () => {
  it('returns lifecycle counts with blocked overlapping, recent lists, owner-scoped', async () => {
    const { agent, project } = await setupProject();
    const t1 = await createTicket(agent, project.id, 'Planned A');
    await createTicket(agent, project.id, 'In progress B');
    await createTicket(agent, project.id, 'Blocked impl C');
    await createTicket(agent, project.id, 'Deployed D');

    // Move B in progress; C implemented + blocked; D deployed.
    await agent.patch(`/api/tickets/${t1.id}`).send({ version: 1 }); // no-op ok

    const t2 = (await agent.get(`/api/projects/${project.id}/tickets/board`)).body.board.columns
      .flatMap((c: { tickets: { id: string; title: string }[] }) => c.tickets)
      .find((t: { title: string }) => t.title === 'In progress B');
    await agent.patch(`/api/tickets/${t2.id}`).send({ version: 1, status: 'IN_PROGRESS' });

    const board = (await agent.get(`/api/projects/${project.id}/tickets/board`)).body.board;
    const byTitle = (title: string) =>
      board.columns
        .flatMap((c: { tickets: { id: string; title: string; version: number }[] }) => c.tickets)
        .find((t: { title: string }) => t.title === title);
    const t3 = byTitle('Blocked impl C');
    await agent.patch(`/api/tickets/${t3.id}`).send({ version: t3.version, status: 'IMPLEMENTED' });
    await agent.patch(`/api/tickets/${t3.id}`).send({
      version: t3.version + 1,
      isBlocked: true,
      blockedReason: 'waiting for mailbox test',
    });
    const t4 = byTitle('Deployed D');
    await agent.patch(`/api/tickets/${t4.id}`).send({ version: t4.version, status: 'DEPLOYED' });

    const res = await agent.get(`/api/projects/${project.id}/dashboard`);
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({
      planned: 1,
      inProgress: 1,
      implemented: 1,
      tested: 0,
      deployed: 1,
      blocked: 1, // overlaps implemented
    });
    expect(res.body.currentBlockers).toHaveLength(1);
    expect(res.body.currentBlockers[0].title).toBe('Blocked impl C');
    expect(res.body.recentlyUpdated.length).toBeGreaterThanOrEqual(3);
    expect(res.body.recentlyDeployed).toHaveLength(1);
  });

  it('excludes archived tickets from counts and lists', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'To archive');
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'IN_PROGRESS' });
    await agent.post(`/api/tickets/${t.id}/archive`);
    const res = await agent.get(`/api/projects/${project.id}/dashboard`);
    expect(res.body.counts.inProgress).toBe(0);
    expect(res.body.counts.blocked).toBe(0);
    expect(res.body.recentlyUpdated).toHaveLength(0);
  });

  it('foreign project dashboard is 404', async () => {
    const { agent, project } = await setupProject();
    const foreign = await createForeignOwner();
    const foreignAgent = authed(app, foreign.cookie);
    const res = await foreignAgent.get(`/api/projects/${project.id}/dashboard`);
    expect(res.status).toBe(404);
    void agent;
  });

  it('requires authentication', async () => {
    const { project } = await setupProject();
    const res = await request(app).get(`/api/projects/${project.id}/dashboard`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------
describe('focus', () => {
  it('groups statuses into the four attention categories; archived excluded', async () => {
    const { agent, project } = await setupProject();
    const a = await createTicket(agent, project.id, 'Progress work');
    const b = await createTicket(agent, project.id, 'Blocked work');
    const c = await createTicket(agent, project.id, 'Implemented work');
    const d = await createTicket(agent, project.id, 'Tested work');
    const dead = await createTicket(agent, project.id, 'Archived work');

    const get = async (id: string) =>
      (await agent.get(`/api/tickets/${id}`)).body.ticket as { version: number };

    await agent
      .patch(`/api/tickets/${a.id}`)
      .send({ version: (await get(a.id)).version, status: 'IN_PROGRESS' });
    await agent.patch(`/api/tickets/${b.id}`).send({
      version: (await get(b.id)).version,
      isBlocked: true,
      blockedReason: 'waiting on upstream',
    });
    await agent
      .patch(`/api/tickets/${c.id}`)
      .send({ version: (await get(c.id)).version, status: 'IMPLEMENTED' });
    await agent
      .patch(`/api/tickets/${d.id}`)
      .send({ version: (await get(d.id)).version, status: 'TESTED' });
    await agent
      .patch(`/api/tickets/${dead.id}`)
      .send({ version: (await get(dead.id)).version, status: 'IN_PROGRESS' });
    await agent.post(`/api/tickets/${dead.id}/archive`);

    const res = await agent.get('/api/focus');
    expect(res.status).toBe(200);
    const groups = res.body.groups as { key: string; tickets: { title: string }[] }[];
    const titles = (key: string) => groups.find((g) => g.key === key)!.tickets.map((t) => t.title);

    expect(titles('in_progress')).toEqual(['Progress work']);
    expect(titles('blocked')).toEqual(['Blocked work']);
    expect(titles('implemented_awaiting_test')).toEqual(['Implemented work']);
    expect(titles('tested_awaiting_deploy')).toEqual(['Tested work']);
    expect(titles('in_progress')).not.toContain('Archived work');
  });

  it('a blocked IMPLEMENTED ticket appears once, in the implemented-awaiting-test group', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Blocked implementation');
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'IMPLEMENTED' });
    await agent.patch(`/api/tickets/${t.id}`).send({
      version: 2,
      isBlocked: true,
      blockedReason: 'needs review',
    });

    const res = await agent.get('/api/focus');
    const groups = res.body.groups as { key: string; tickets: { title: string }[] }[];
    const all = groups.flatMap((g) => g.tickets.map((t) => t.title));
    expect(all.filter((x) => x === 'Blocked implementation')).toHaveLength(1);
    expect(groups.find((g) => g.key === 'implemented_awaiting_test')!.tickets).toHaveLength(1);
  });

  it('orders focus tickets by priority with P0 first', async () => {
    const { agent, project } = await setupProject();
    const low = await createTicket(agent, project.id, 'Low priority');
    const urgent = await createTicket(agent, project.id, 'Urgent priority');
    const normal = await createTicket(agent, project.id, 'Normal priority');

    await agent
      .patch(`/api/tickets/${low.id}`)
      .send({ version: 1, status: 'IN_PROGRESS', priority: 'P3' });
    await agent
      .patch(`/api/tickets/${urgent.id}`)
      .send({ version: 1, status: 'IN_PROGRESS', priority: 'P0' });
    await agent
      .patch(`/api/tickets/${normal.id}`)
      .send({ version: 1, status: 'IN_PROGRESS', priority: 'P2' });

    const res = await agent.get('/api/focus');
    const groups = res.body.groups as { key: string; tickets: { title: string }[] }[];
    expect(groups.find((g) => g.key === 'in_progress')!.tickets.map((t) => t.title)).toEqual([
      'Urgent priority',
      'Normal priority',
      'Low priority',
    ]);
  });

  it('project-scoped focus filters to one project', async () => {
    const { agent, project } = await setupProject('First', 'FST');
    const other = (await agent.post('/api/projects').send({ name: 'Second', projectKey: 'SEC' }))
      .body.project;
    const a = await createTicket(agent, project.id, 'First project work');
    const b = await createTicket(agent, other.id, 'Second project work');
    await agent.patch(`/api/tickets/${a.id}`).send({ version: 1, status: 'IN_PROGRESS' });
    await agent.patch(`/api/tickets/${b.id}`).send({ version: 1, status: 'TESTED' });

    const res = await agent.get(`/api/focus?projectId=${project.id}`);
    const groups = res.body.groups as { key: string; tickets: { title: string }[] }[];
    const all = groups.flatMap((g) => g.tickets.map((t) => t.title));
    expect(all).toContain('First project work');
    expect(all).not.toContain('Second project work');
  });

  it('validates the project filter and hides foreign projects behind 404', async () => {
    const { agent, project } = await setupProject();
    const invalid = await agent.get('/api/focus?projectId=not-a-uuid');
    expect(invalid.status).toBe(422);

    const foreign = await createForeignOwner();
    const foreignAgent = authed(app, foreign.cookie);
    const hidden = await foreignAgent.get(`/api/focus?projectId=${project.id}`);
    expect(hidden.status).toBe(404);
  });

  it('global focus requires authentication', async () => {
    const res = await request(app).get('/api/focus');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Accomplishments
// ---------------------------------------------------------------------------
describe('accomplishments', () => {
  it('groups deployed tickets by deployedAt recency, newest first; excludes archived', async () => {
    const { agent, project } = await setupProject();
    const t1 = await createTicket(agent, project.id, 'Shipped today');
    const t2 = await createTicket(agent, project.id, 'Shipped earlier');
    const t3 = await createTicket(agent, project.id, 'Shipped long ago');
    const dead = await createTicket(agent, project.id, 'Archived shipped');

    // Deploy all four, then rewrite deployedAt to bucket them deterministically.
    const all = [t1, t2, t3, dead];
    for (const t of all) {
      await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'DEPLOYED' });
    }
    const pool = (await import('../db/client.js')).getPool();
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      return d.toISOString().slice(0, 19).replace('T', ' ');
    };
    await pool.execute('UPDATE tickets SET deployed_at = ? WHERE id = ?', [day(0), t1.id]);
    await pool.execute('UPDATE tickets SET deployed_at = ? WHERE id = ?', [day(1), t2.id]);
    await pool.execute('UPDATE tickets SET deployed_at = ? WHERE id = ?', [day(40), t3.id]);
    await pool.execute('UPDATE tickets SET deployed_at = ? WHERE id = ?', [day(2), dead.id]);
    await agent.post(`/api/tickets/${dead.id}/archive`);

    const res = await agent.get(`/api/projects/${project.id}/accomplishments`);
    expect(res.status).toBe(200);
    const groups = res.body.groups as { key: string; tickets: { title: string }[] }[];
    expect(groups.find((g) => g.key === 'today')!.tickets.map((t) => t.title)).toEqual([
      'Shipped today',
    ]);
    expect(groups.find((g) => g.key === 'this_week')!.tickets.map((t) => t.title)).toEqual([
      'Shipped earlier',
    ]);
    expect(groups.find((g) => g.key === 'older')!.tickets.map((t) => t.title)).toEqual([
      'Shipped long ago',
    ]);
    expect(groups.find((g) => g.key === 'this_week')!.tickets).not.toContainEqual(
      expect.objectContaining({ title: 'Archived shipped' }),
    );
  });

  it('reports DEPLOYED tickets missing deployedAt as data issues without inventing timestamps', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Broken deploy record');
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'DEPLOYED' });
    const pool = (await import('../db/client.js')).getPool();
    await pool.execute('UPDATE tickets SET deployed_at = NULL WHERE id = ?', [t.id]);

    const res = await agent.get(`/api/projects/${project.id}/accomplishments`);
    const groups = res.body.groups as { dataIssues: { displayId: string }[] }[];
    const issues = groups.flatMap((g) => g.dataIssues);
    expect(issues).toHaveLength(1);
    expect(issues[0].displayId).toMatch(/^TMR-\d+$/);
  });

  it('foreign project is 404', async () => {
    const { project } = await setupProject();
    const foreign = await createForeignOwner();
    const foreignAgent = authed(app, foreign.cookie);
    const res = await foreignAgent.get(`/api/projects/${project.id}/accomplishments`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Direct ticket lookup by number / display ID
// ---------------------------------------------------------------------------
describe('ticket by-number lookup', () => {
  it('resolves bare number, zero-padded number, and full display ID', async () => {
    const { agent, project } = await setupProject();
    await createTicket(agent, project.id, 'One');
    const two = await createTicket(agent, project.id, 'Two');

    for (const ref of ['2', '02', 'TMR-002', 'tmr-2']) {
      const res = await agent.get(`/api/projects/${project.id}/tickets/by-number/${ref}`);
      expect(res.status, `ref=${ref}`).toBe(200);
      expect(res.body.ticket.id).toBe(two.id);
    }
  });

  it('rejects mismatched project key in display ID and unknown numbers with 404', async () => {
    const { agent, project } = await setupProject();
    await createTicket(agent, project.id, 'Only one');
    const wrong = await agent.get(`/api/projects/${project.id}/tickets/by-number/XXX-001`);
    expect(wrong.status).toBe(404);
    const missing = await agent.get(`/api/projects/${project.id}/tickets/by-number/99`);
    expect(missing.status).toBe(404);
    const garbage = await agent.get(`/api/projects/${project.id}/tickets/by-number/abc`);
    expect(garbage.status).toBe(422);
    const zero = await agent.get(`/api/projects/${project.id}/tickets/by-number/0`);
    expect(zero.status).toBe(422);
    const unsafe = await agent.get(
      `/api/projects/${project.id}/tickets/by-number/999999999999999999999999999999`,
    );
    expect(unsafe.status).toBe(422);
  });

  it('foreign owner cannot look up tickets in a project they do not own', async () => {
    const { project } = await setupProject();
    const foreign = await createForeignOwner();
    const foreignAgent = authed(app, foreign.cookie);
    const res = await foreignAgent.get(`/api/projects/${project.id}/tickets/by-number/1`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// List tag aggregation (Phase 3 N+1 fix)
// ---------------------------------------------------------------------------
describe('list tag aggregation', () => {
  it('returns tag chips with each list row without duplicate rows for multi-tag tickets', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Multi-tag ticket');
    const tagA = (await agent.post(`/api/projects/${project.id}/tags`).send({ name: 'security' }))
      .body.tag;
    const tagB = (await agent.post(`/api/projects/${project.id}/tags`).send({ name: 'email' })).body
      .tag;
    await agent.post(`/api/tickets/${t.id}/tags`).send({ tagId: tagA.id });
    await agent.post(`/api/tickets/${t.id}/tags`).send({ tagId: tagB.id });

    const res = await agent.get(`/api/projects/${project.id}/tickets`);
    expect(res.status).toBe(200);
    const rows = res.body.tickets as { id: string; tags: { name: string }[] }[];
    const mine = rows.filter((r) => r.id === t.id);
    expect(mine).toHaveLength(1); // no duplicate rows from the join
    expect(mine[0].tags.map((g) => g.name).sort()).toEqual(['email', 'security']);
  });

  it('rows without tags get an empty tags array', async () => {
    const { agent, project } = await setupProject();
    await createTicket(agent, project.id, 'Untagged');
    const res = await agent.get(`/api/projects/${project.id}/tickets`);
    const rows = res.body.tickets as { tags: unknown[] }[];
    expect(rows[0].tags).toEqual([]);
  });
});
