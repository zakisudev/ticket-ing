import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closePool } from '../db/client.js';
import { ensureMigrated, truncateAll, registerOwner, authed, createForeignOwner } from './helpers.js';

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

describe('ticket quick create + numbering', () => {
  it('creates tickets with defaults and sequential numbers', async () => {
    const { agent, project } = await setupProject();
    const t1 = await createTicket(agent, project.id, 'First');
    const t2 = await createTicket(agent, project.id, 'Second');
    const t3 = await createTicket(agent, project.id, 'Third');
    expect(t1.displayId).toBe('TMR-001');
    expect(t2.displayId).toBe('TMR-002');
    expect(t3.displayId).toBe('TMR-003');
    expect(t1.status).toBe('PLANNED');
    expect(t1.priority).toBe('P2');
    expect(t1.type).toBe('FEATURE');
    expect(t1.version).toBe(1);
  });

  it('allocates numbers atomically under concurrency (real DB)', async () => {
    const { agent, project } = await setupProject();
    const COUNT = 12;
    const results = await Promise.all(
      Array.from({ length: COUNT }, (_, i) =>
        agent.post(`/api/projects/${project.id}/tickets`).send({ title: `Concurrent ${i}` })
      )
    );
    results.forEach((r) => expect(r.status).toBe(201));
    const numbers = results.map((r) => r.body.ticket.ticketNumber).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: COUNT }, (_, i) => i + 1));
    // Strictly unique, strictly sequential, zero gaps.
    expect(new Set(numbers).size).toBe(COUNT);
  });

  it('numbers never reuse after deletion-equivalent (archive does not decrement counter)', async () => {
    const { agent, project } = await setupProject();
    const t1 = await createTicket(agent, project.id, 'Will archive');
    await agent.post(`/api/tickets/${t1.id}/archive`);
    const t2 = await createTicket(agent, project.id, 'After archive');
    expect(t2.ticketNumber).toBe(t1.ticketNumber + 1);
  });

  it('returns 404 when creating in a foreign project', async () => {
    const { project } = await setupProject();
    const foreign = await createForeignOwner();
    const f = authed(app, foreign.cookie);
    const res = await f.post(`/api/projects/${project.id}/tickets`).send({ title: 'Injected' });
    expect(res.status).toBe(404);
  });

  it('rejects over-long titles', async () => {
    const { agent, project } = await setupProject();
    const res = await agent.post(`/api/projects/${project.id}/tickets`).send({ title: 'x'.repeat(201) });
    expect(res.status).toBe(422);
  });
});

describe('status transitions and milestone timestamps', () => {
  it('walks the full workflow forward setting each milestone once', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Flow');
    let current = t;
    for (const status of ['IN_PROGRESS', 'IMPLEMENTED', 'TESTED', 'DEPLOYED'] as const) {
      const res = await agent
        .patch(`/api/tickets/${current.id}`)
        .send({ version: current.version, status });
      expect(res.status).toBe(200);
      current = res.body.ticket;
      expect(current.status).toBe(status);
      const field = { IN_PROGRESS: 'startedAt', IMPLEMENTED: 'implementedAt', TESTED: 'testedAt', DEPLOYED: 'deployedAt' }[status];
      expect(current[field], `${field} set`).toBeTruthy();
    }
  });

  it('backward transition never erases milestone timestamps and records activity', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Backward');
    const deployed = (await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'DEPLOYED' })).body.ticket;
    expect(deployed.deployedAt).toBeTruthy(); // first entry stamps the reached milestone
    expect(deployed.startedAt).toBeNull(); // strict first-entry rule: never started

    // Now a 2-step backward walk reaches IN_PROGRESS and stamps startedAt.
    const planned = (await agent.patch(`/api/tickets/${t.id}`).send({ version: deployed.version, status: 'PLANNED' })).body.ticket;
    const back = (await agent.patch(`/api/tickets/${t.id}`).send({ version: planned.version, status: 'IN_PROGRESS' })).body.ticket;
    expect(back.status).toBe('IN_PROGRESS');
    expect(back.startedAt).toBeTruthy(); // set on first entry into IN_PROGRESS
    expect(back.deployedAt).toBe(deployed.deployedAt); // preserved — history never erased

    const detail = await agent.get(`/api/tickets/${t.id}`);
    const statusEvents = detail.body.ticket.activity.filter((a: { type: string }) => a.type === 'STATUS_CHANGED');
    expect(statusEvents.length).toBe(3); // PLANNED→DEPLOYED, DEPLOYED→PLANNED, PLANNED→IN_PROGRESS
    // Newest first (monotonic seq ordering):
    expect(statusEvents[0].metadata).toEqual({ from: 'PLANNED', to: 'IN_PROGRESS' });
    expect(statusEvents[1].metadata).toEqual({ from: 'DEPLOYED', to: 'PLANNED' });
    expect(statusEvents[2].metadata).toEqual({ from: 'PLANNED', to: 'DEPLOYED' });
  });

  it('BLOCKED requires a reason', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Blocked test');
    const noReason = await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'BLOCKED' });
    expect(noReason.status).toBe(422);

    const emptyReason = await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'BLOCKED', blockedReason: '   ' });
    expect(emptyReason.status).toBe(422);

    const blocked = await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'BLOCKED', blockedReason: 'waiting on upstream fix' });
    expect(blocked.status).toBe(200);
    expect(blocked.body.ticket.status).toBe('BLOCKED');
    expect(blocked.body.ticket.blockedReason).toBe('waiting on upstream fix');
  });

  it('unblocking clears the live reason but preserves it in activity', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Unblock test');
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'BLOCKED', blockedReason: 'waiting on OPS3B' });
    const unblocked = await agent.patch(`/api/tickets/${t.id}`).send({ version: 2, status: 'PLANNED' });
    expect(unblocked.status).toBe(200);
    expect(unblocked.body.ticket.blockedReason).toBeNull();
    const detail = await agent.get(`/api/tickets/${t.id}`);
    const unblockEvents = detail.body.ticket.activity.filter((a: { type: string }) => a.type === 'UNBLOCKED');
    expect(unblockEvents.length).toBe(1);
    expect(unblockEvents[0].metadata.previousReason).toBe('waiting on OPS3B');
  });
});

describe('activity history', () => {
  it('records TICKET_CREATED on creation', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Created activity');
    const detail = await agent.get(`/api/tickets/${t.id}`);
    expect(detail.body.ticket.activity[0].type).toBe('TICKET_CREATED');
    expect(detail.body.ticket.activity[0].metadata.status).toBe('PLANNED');
  });

  it('records priority, type, and title changes', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Title A');
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, priority: 'P0' });
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 2, type: 'BUG' });
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 3, title: 'Title B' });
    const detail = await agent.get(`/api/tickets/${t.id}`);
    const types = detail.body.ticket.activity.map((a: { type: string }) => a.type);
    expect(types).toContain('PRIORITY_CHANGED');
    expect(types).toContain('TYPE_CHANGED');
    expect(types).toContain('TITLE_CHANGED');
    const titleEvent = detail.body.ticket.activity.find((a: { type: string }) => a.type === 'TITLE_CHANGED');
    expect(titleEvent.metadata).toEqual({ from: 'Title A', to: 'Title B' });
  });

  it('summarizes multiple field edits into one FIELDS_UPDATED entry with field names only', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Fields');
    const res = await agent.patch(`/api/tickets/${t.id}`).send({
      version: 1,
      description: 'long text '.repeat(50),
      limitations: 'some limitation text',
      summary: 'a summary',
    });
    expect(res.status).toBe(200);
    const detail = await agent.get(`/api/tickets/${t.id}`);
    const fieldEvents = detail.body.ticket.activity.filter((a: { type: string }) => a.type === 'FIELDS_UPDATED');
    expect(fieldEvents.length).toBe(1);
    expect(fieldEvents[0].metadata.fields).toEqual(
      expect.arrayContaining(['description', 'limitations', 'summary'])
    );
    // Metadata must NOT contain the actual text contents.
    expect(JSON.stringify(fieldEvents[0].metadata)).not.toContain('long text');
    expect(JSON.stringify(detail.body.ticket.activity)).not.toContain('some limitation text');
  });
});

describe('optimistic concurrency', () => {
  it('returns 409 STALE_UPDATE when version mismatches', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Stale');
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, summary: 'bumped by other tab' });
    const stale = await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, title: 'stale edit' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_UPDATE');
    expect(stale.body.error.message).toBe('This ticket was updated elsewhere.');
    // Server state reflects the winning write only.
    const detail = await agent.get(`/api/tickets/${t.id}`);
    expect(detail.body.ticket.title).toBe('Stale');
    expect(detail.body.ticket.summary).toBe('bumped by other tab');
    expect(detail.body.ticket.version).toBe(2);
  });

  it('bumps version on every successful patch', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Versions');
    let current = t;
    for (let i = 2; i <= 4; i++) {
      const res = await agent.patch(`/api/tickets/${current.id}`).send({ version: current.version, summary: `v${i}` });
      expect(res.body.ticket.version).toBe(i);
      current = res.body.ticket;
    }
  });

  it('no-ops that change nothing still guard version', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Noop');
    const res = await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, summary: 'same-or-new' });
    expect(res.status).toBe(200);
    expect(res.body.ticket.version).toBe(2);
  });
});

describe('board', () => {
  it('returns five workflow columns plus a distinct blocked column, with archived excluded', async () => {
    const { agent, project } = await setupProject();
    const planned = await createTicket(agent, project.id, 'Planned one');
    const inprog = await createTicket(agent, project.id, 'In progress one');
    await agent.patch(`/api/tickets/${inprog.id}`).send({ version: 1, status: 'IN_PROGRESS' });
    const done = await createTicket(agent, project.id, 'Deployed one');
    await agent.patch(`/api/tickets/${done.id}`).send({ version: 1, status: 'DEPLOYED' });
    const archived = await createTicket(agent, project.id, 'Archived one');
    await agent.post(`/api/tickets/${archived.id}/archive`);

    const res = await agent.get(`/api/projects/${project.id}/tickets/board`);
    expect(res.status).toBe(200);
    const board = res.body.board;
    expect(board.projectKey).toBe('TMR');
    expect(board.columns.map((c: { status: string }) => c.status)).toEqual([
      'PLANNED',
      'IN_PROGRESS',
      'IMPLEMENTED',
      'TESTED',
      'DEPLOYED',
      'BLOCKED',
    ]);
    const plannedCol = board.columns[0].tickets;
    expect(plannedCol.some((x: { id: string }) => x.id === planned.id)).toBe(true);
    expect(plannedCol.some((x: { id: string }) => x.id === archived.id)).toBe(false);
    expect(board.columns[1].tickets).toHaveLength(1);
    expect(board.columns[4].tickets).toHaveLength(1);
  });

  it('shows blocked tickets in the distinct BLOCKED column with reason', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Blocked on board');
    await agent.patch(`/api/tickets/${t.id}`).send({ version: 1, status: 'BLOCKED', blockedReason: 'needs decision' });
    const res = await agent.get(`/api/projects/${project.id}/tickets/board`);
    const blockedCol = res.body.board.columns[5];
    expect(blockedCol.status).toBe('BLOCKED');
    const blocked = blockedCol.tickets.find((x: { id: string }) => x.id === t.id);
    expect(blocked).toBeDefined();
    expect(blocked.blockedReason).toBe('needs decision');
    // Not mixed into PLANNED.
    expect(res.body.board.columns[0].tickets.some((x: { id: string }) => x.id === t.id)).toBe(false);
  });
});

describe('archived ticket restore', () => {
  it('restores an archived ticket to PLANNED', async () => {
    const { agent, project } = await setupProject();
    const t = await createTicket(agent, project.id, 'Restore me');
    await agent.post(`/api/tickets/${t.id}/archive`);
    const res = await agent.post(`/api/tickets/${t.id}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('PLANNED');
    const detail = await agent.get(`/api/tickets/${t.id}`);
    const types = detail.body.ticket.activity.map((a: { type: string }) => a.type);
    expect(types).toContain('TICKET_ARCHIVED');
    expect(types).toContain('TICKET_RESTORED');
  });
});

describe('health', () => {
  it('reports liveness and readiness', async () => {
    const live = await request(app).get('/health');
    expect(live.status).toBe(200);
    expect(live.body.ok).toBe(true);
    const ready = await request(app).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.database).toBe('up');
  });
});
