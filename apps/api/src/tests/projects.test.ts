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

describe('project CRUD', () => {
  it('creates a project with derived slug and returns it', async () => {
    const { agent } = await registerOwner(app);
    const res = await agent.post('/api/projects').send({ name: 'TemariOne', projectKey: 'TMR' });
    expect(res.status).toBe(201);
    expect(res.body.project.slug).toBe('temarione');
    expect(res.body.project.projectKey).toBe('TMR');
    expect(res.body.project.ticketCount).toBe(0);
  });

  it('rejects invalid keys and URLs', async () => {
    const { agent } = await registerOwner(app);
    const badKey = await agent.post('/api/projects').send({ name: 'X', projectKey: 'tmr' });
    expect(badKey.status).toBe(422);
    const badUrl = await agent
      .post('/api/projects')
      .send({ name: 'X', projectKey: 'XYZ', productionUrl: 'javascript:alert(1)' });
    expect(badUrl.status).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('lists projects scoped to the owner', async () => {
    const owner1 = await registerOwner(app, 'o1@zakisu.test');
    await owner1.agent.post('/api/projects').send({ name: 'One', projectKey: 'ONE' });
    // A foreign user inserted directly (registration is closed now).
    const foreign = await createForeignOwner('other@zakisu.test');
    const foreignAgent = authed(app, foreign.cookie);
    // Foreign user can still create projects via API (they are authenticated; only
    // public *registration* is closed).
    await foreignAgent.post('/api/projects').send({ name: 'Two', projectKey: 'TWO' });

    const res = await owner1.agent.get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0].name).toBe('One');
  });

  it('derives unique slugs for duplicate names', async () => {
    const { agent } = await registerOwner(app);
    await agent.post('/api/projects').send({ name: 'Same Name', projectKey: 'AAA' });
    const second = await agent.post('/api/projects').send({ name: 'Same Name', projectKey: 'BBB' });
    expect(second.status).toBe(201);
    expect(second.body.project.slug).toBe('same-name-2');
  });

  it('rejects a duplicate project key per owner', async () => {
    const { agent } = await registerOwner(app);
    await agent.post('/api/projects').send({ name: 'First', projectKey: 'DUP' });
    const res = await agent.post('/api/projects').send({ name: 'Second', projectKey: 'DUP' });
    expect(res.status).toBe(409);
  });

  it('reads, updates, and archives', async () => {
    const { agent } = await registerOwner(app);
    const created = (await agent.post('/api/projects').send({ name: 'Life', projectKey: 'LIFE' })).body.project;

    const read = await agent.get(`/api/projects/${created.id}`);
    expect(read.status).toBe(200);

    const updated = await agent.patch(`/api/projects/${created.id}`).send({ description: 'Updated' });
    expect(updated.body.project.description).toBe('Updated');

    const archived = await agent.post(`/api/projects/${created.id}/archive`);
    expect(archived.body.project.archived).toBe(true);

    const list = await agent.get('/api/projects');
    expect(list.body.projects).toHaveLength(0);
    const listAll = await agent.get('/api/projects?includeArchived=true');
    expect(listAll.body.projects).toHaveLength(1);

    const unarchived = await agent.post(`/api/projects/${created.id}/unarchive`);
    expect(unarchived.body.project.archived).toBe(false);
  });

  it('returns 404 for unknown and foreign projects', async () => {
    const { agent } = await registerOwner(app);
    expect((await agent.get('/api/projects/does-not-exist')).status).toBe(404);
    const foreign = await createForeignOwner();
    const f = authed(app, foreign.cookie);
    const created = (await agent.post('/api/projects').send({ name: 'Mine', projectKey: 'MINE' })).body.project;
    expect((await f.get(`/api/projects/${created.id}`)).status).toBe(404);
    expect((await f.patch(`/api/projects/${created.id}`).send({ name: 'Stolen' })).status).toBe(404);
    expect((await f.post(`/api/projects/${created.id}/archive`)).status).toBe(404);
  });
});

describe('project key immutability', () => {
  it('allows key edits before the first ticket exists', async () => {
    const { agent } = await registerOwner(app);
    const created = (await agent.post('/api/projects').send({ name: 'Young', projectKey: 'YNG' })).body.project;
    const res = await agent.patch(`/api/projects/${created.id}`).send({ projectKey: 'YOUNG' });
    expect(res.status).toBe(200);
    expect(res.body.project.projectKey).toBe('YOUNG');
  });

  it('locks the key after tickets exist (tested rule)', async () => {
    const { agent } = await registerOwner(app);
    const created = (await agent.post('/api/projects').send({ name: 'Mature', projectKey: 'MAT' })).body.project;
    await agent.post(`/api/projects/${created.id}/tickets`).send({ title: 'First' });

    const res = await agent.patch(`/api/projects/${created.id}`).send({ projectKey: 'MATURE' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    const read = await agent.get(`/api/projects/${created.id}`);
    expect(read.body.project.projectKey).toBe('MAT');
  });

  it('allows other edits after tickets exist', async () => {
    const { agent } = await registerOwner(app);
    const created = (await agent.post('/api/projects').send({ name: 'Editable', projectKey: 'EDI' })).body.project;
    await agent.post(`/api/projects/${created.id}/tickets`).send({ title: 'T1' });
    const res = await agent.patch(`/api/projects/${created.id}`).send({ description: 'still editable' });
    expect(res.status).toBe(200);
    expect(res.body.project.description).toBe('still editable');
  });
});
