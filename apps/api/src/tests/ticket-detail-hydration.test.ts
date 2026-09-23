import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { closePool } from '../db/client.js';
import { authed, createForeignOwner, ensureMigrated, registerOwner, truncateAll } from './helpers.js';

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
  const project = (await agent.post('/api/projects').send({ name: 'Zakisu Tickets', projectKey: 'ZKT' })).body
    .project;
  return { agent, project };
}

async function createTicket(agent: Agent, projectId: string, title: string) {
  const response = await agent.post(`/api/projects/${projectId}/tickets`).send({ title });
  expect(response.status).toBe(201);
  return response.body.ticket;
}

describe('ticket detail hydration', () => {
  it('returns stable empty arrays for a ticket without subresources', async () => {
    const { agent, project } = await setupProject();
    const ticket = await createTicket(agent, project.id, 'Empty detail');

    const detail = await agent.get(`/api/tickets/${ticket.id}`);

    expect(detail.status).toBe(200);
    expect(detail.body.ticket).toMatchObject({ checklist: [], links: [], relations: [], tags: [] });
  });

  it('hydrates checklist state, links, and attached tags on every fresh detail read', async () => {
    const { agent, project } = await setupProject();
    const ticket = await createTicket(agent, project.id, 'Hydrated detail');
    const checklistItem = (
      await agent
        .post(`/api/tickets/${ticket.id}/checklist`)
        .send({ text: 'Production application starts' })
    ).body.item;
    const link = (
      await agent.post(`/api/tickets/${ticket.id}/links`).send({
        type: 'COMMIT',
        label: '972e53136b0b203525f04705e288157ad3f371a3',
        url: 'https://github.com/zakisudev/ticket-ing/commit/972e53136b0b203525f04705e288157ad3f371a3',
      })
    ).body.link;
    const tag = (
      await agent
        .post(`/api/projects/${project.id}/tags`)
        .send({ name: 'Production', color: '#1f6feb' })
    ).body.tag;
    await agent.post(`/api/tickets/${ticket.id}/tags`).send({ tagId: tag.id });

    const firstDetail = await agent.get(`/api/tickets/${ticket.id}`);
    expect(firstDetail.body.ticket.checklist).toEqual([
      expect.objectContaining({
        id: checklistItem.id,
        text: 'Production application starts',
        completed: false,
        sortOrder: 0,
      }),
    ]);
    expect(firstDetail.body.ticket.links).toEqual([
      expect.objectContaining({
        id: link.id,
        type: 'COMMIT',
        label: '972e53136b0b203525f04705e288157ad3f371a3',
        url: 'https://github.com/zakisudev/ticket-ing/commit/972e53136b0b203525f04705e288157ad3f371a3',
      }),
    ]);
    expect(firstDetail.body.ticket.tags).toEqual([
      expect.objectContaining({
        id: tag.id,
        name: 'Production',
        slug: 'production',
        color: '#1f6feb',
      }),
    ]);

    await agent
      .patch(`/api/tickets/${ticket.id}/checklist/${checklistItem.id}`)
      .send({ completed: true });
    await agent.delete(`/api/tickets/${ticket.id}/tags/${tag.id}`);

    const updatedDetail = await agent.get(`/api/tickets/${ticket.id}`);
    expect(updatedDetail.body.ticket.checklist[0]).toMatchObject({
      id: checklistItem.id,
      completed: true,
    });
    expect(updatedDetail.body.ticket.checklist[0].completedAt).not.toBeNull();
    expect(updatedDetail.body.ticket.tags).toEqual([]);
  });

  it('hydrates directional and symmetric relations from each ticket perspective', async () => {
    const { agent, project } = await setupProject();
    const blocker = await createTicket(agent, project.id, 'Blocker');
    const blocked = await createTicket(agent, project.id, 'Blocked work');
    const relatedA = await createTicket(agent, project.id, 'Related A');
    const relatedB = await createTicket(agent, project.id, 'Related B');

    await agent
      .post(`/api/tickets/${blocker.id}/relations`)
      .send({ type: 'BLOCKS', otherTicketId: blocked.id });
    await agent
      .post(`/api/tickets/${relatedB.id}/relations`)
      .send({ type: 'RELATED_TO', otherTicketId: relatedA.id });

    const [blockerDetail, blockedDetail, relatedADetail, relatedBDetail] = await Promise.all([
      agent.get(`/api/tickets/${blocker.id}`),
      agent.get(`/api/tickets/${blocked.id}`),
      agent.get(`/api/tickets/${relatedA.id}`),
      agent.get(`/api/tickets/${relatedB.id}`),
    ]);

    expect(blockerDetail.body.ticket.relations).toEqual([
      expect.objectContaining({ type: 'BLOCKS', otherTicketId: blocked.id }),
    ]);
    expect(blockedDetail.body.ticket.relations).toEqual([
      expect.objectContaining({ type: 'BLOCKED_BY', otherTicketId: blocker.id }),
    ]);
    expect(relatedADetail.body.ticket.relations).toEqual([
      expect.objectContaining({ type: 'RELATED_TO', otherTicketId: relatedB.id }),
    ]);
    expect(relatedBDetail.body.ticket.relations).toEqual([
      expect.objectContaining({ type: 'RELATED_TO', otherTicketId: relatedA.id }),
    ]);
  });

  it('returns 404 without hydrating any subresources for a foreign owner', async () => {
    const { agent, project } = await setupProject();
    const ticket = await createTicket(agent, project.id, 'Private detail');
    const otherTicket = await createTicket(agent, project.id, 'Private relation target');
    const tag = (
      await agent.post(`/api/projects/${project.id}/tags`).send({ name: 'Private tag' })
    ).body.tag;

    await agent.post(`/api/tickets/${ticket.id}/checklist`).send({ text: 'Private checklist' });
    await agent
      .post(`/api/tickets/${ticket.id}/links`)
      .send({ type: 'OTHER', label: 'Private link', url: 'https://example.com/private' });
    await agent
      .post(`/api/tickets/${ticket.id}/relations`)
      .send({ type: 'BLOCKS', otherTicketId: otherTicket.id });
    await agent.post(`/api/tickets/${ticket.id}/tags`).send({ tagId: tag.id });

    const foreign = await createForeignOwner();
    const response = await authed(app, foreign.cookie).get(`/api/tickets/${ticket.id}`);

    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('ticket');
  });
});
