import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { RowDataPacket } from 'mysql2/promise';
import { createApp } from '../app.js';
import { __resetLoginRateLimiterForTests } from '../modules/auth/auth.routes.js';
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

describe('registration gating', () => {
  it('reports registration open with zero users', async () => {
    const res = await request(app).get('/api/auth/registration-status');
    expect(res.status).toBe(200);
    expect(res.body.open).toBe(true);
  });

  it('allows the first registration and returns a session', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'owner@zakisu.test', password: 'owner-password-1', name: 'Owner' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('owner@zakisu.test');
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
  });

  it('rejects the second public registration', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@zakisu.test', password: 'password-aaa-1' });
    const res = await request(app).post('/api/auth/register').send({ email: 'b@zakisu.test', password: 'password-bbb-1' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('closes registration status after the first user', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@zakisu.test', password: 'password-aaa-1' });
    const res = await request(app).get('/api/auth/registration-status');
    expect(res.body.open).toBe(false);
  });

  it('rejects invalid payloads with VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('prevents concurrent first-user creation (real DB race)', async () => {
    const payload = { email: 'race@zakisu.test', password: 'race-password-1' };
    const results = await Promise.all([
      request(app).post('/api/auth/register').send(payload),
      request(app).post('/api/auth/register').send(payload),
      request(app).post('/api/auth/register').send(payload),
    ]);
    const created = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(created.length).toBe(1);
    expect(rejected.length).toBe(2);

    const pool = (await import('../db/client.js')).getPool();
    const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM users');
    expect(Number((rows[0] as { c: number }).c)).toBe(1);
  });
});

describe('login', () => {
  it('logs in with valid credentials and sets an HttpOnly cookie', async () => {
    await request(app).post('/api/auth/register').send({ email: 'login@zakisu.test', password: 'login-password-1' });
    const res = await request(app).post('/api/auth/login').send({ email: 'login@zakisu.test', password: 'login-password-1' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(res.headers['set-cookie'][0]).toMatch(/zt_session/);
  });

  it('returns a generic error for wrong password (no user enumeration)', async () => {
    await request(app).post('/api/auth/register').send({ email: 'login2@zakisu.test', password: 'login-password-1' });
    const res = await request(app).post('/api/auth/login').send({ email: 'login2@zakisu.test', password: 'wrong-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('returns a generic error for unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@zakisu.test', password: 'whatever-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('normalizes email case for login', async () => {
    await request(app).post('/api/auth/register').send({ email: 'case@zakisu.test', password: 'case-password-1' });
    const res = await request(app).post('/api/auth/login').send({ email: '  CASE@ZAKISU.test ', password: 'case-password-1' });
    expect(res.status).toBe(200);
  });

  it('rate limits repeated failures with RATE_LIMITED', async () => {
    __resetLoginRateLimiterForTests();
    await request(app).post('/api/auth/register').send({ email: 'rl@zakisu.test', password: 'rl-password-123' });
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').send({ email: 'rl@zakisu.test', password: 'wrong-password-1' });
    }
    const res = await request(app).post('/api/auth/login').send({ email: 'rl@zakisu.test', password: 'rl-password-123' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    __resetLoginRateLimiterForTests();
  });

  it('does not leak whether the email exists in failure messages', async () => {
    __resetLoginRateLimiterForTests();
    const known = await request(app).post('/api/auth/login').send({ email: 'rl@zakisu.test', password: 'wrong-password-1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nope@zakisu.test', password: 'wrong-password-1' });
    expect(known.body.error.message).toBe(unknown.body.error.message);
    expect(known.body.error.message).toBe('Invalid email or password');
    __resetLoginRateLimiterForTests();
  });
});

describe('sessions', () => {
  it('me returns the authenticated user', async () => {
    const { agent } = await registerOwner(app);
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('owner@zakisu.test');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects invalid or missing sessions with UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'zt_session=forged-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    const noCookie = await request(app).get('/api/auth/me');
    expect(noCookie.status).toBe(401);
  });

  it('logout invalidates the session', async () => {
    const { agent } = await registerOwner(app);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('expired sessions are rejected', async () => {
    const { agent } = await registerOwner(app);
    const pool = (await import('../db/client.js')).getPool();
    await pool.query("UPDATE sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR)");
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});

describe('change password', () => {
  it('requires the current password', async () => {
    const { agent } = await registerOwner(app);
    const res = await agent.post('/api/auth/change-password').send({ currentPassword: 'wrong-password-1', newPassword: 'new-password-123' });
    expect(res.status).toBe(401);
  });

  it('rotates sessions, issues a fresh one, and old sessions stop working', async () => {
    const register = await request(app).post('/api/auth/register').send({ email: 'rotate@zakisu.test', password: 'old-password-123' });
    const firstCookie = register.headers['set-cookie'];
    const a = authed(app, firstCookie);
    expect((await a.get('/api/auth/me')).status).toBe(200);

    const res = await a.post('/api/auth/change-password').send({ currentPassword: 'old-password-123', newPassword: 'new-password-456' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();

    // Old cookie no longer works...
    expect((await a.get('/api/auth/me')).status).toBe(401);
    // ...but the fresh cookie does, and the new password validates.
    const fresh = authed(app, res.headers['set-cookie']);
    expect((await fresh.get('/api/auth/me')).status).toBe(200);
    const relogin = await request(app).post('/api/auth/login').send({ email: 'rotate@zakisu.test', password: 'new-password-456' });
    expect(relogin.status).toBe(200);
  });
});

describe('origin enforcement', () => {
  it('rejects state-changing requests from a foreign origin', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Origin', 'https://evil.example')
      .send({ name: 'X', projectKey: 'XX' });
    expect(res.status).toBe(403);
  });

  it('allows requests without an origin (server-to-server)', async () => {
    // No Origin header: not a browser CSRF vector.
    const res = await request(app).get('/api/auth/registration-status');
    expect(res.status).toBe(200);
  });
});

describe('foreign ownership (security)', () => {
  it('hides foreign projects behind 404', async () => {
    const { agent } = await registerOwner(app);
    const created = await agent.post('/api/projects').send({ name: 'Mine', projectKey: 'MINE' });
    const projectId = created.body.project.id;
    const foreign = await createForeignOwner();
    const f = authed(app, foreign.cookie);
    const res = await f.get(`/api/projects/${projectId}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('hides foreign tickets behind 404', async () => {
    const { agent } = await registerOwner(app);
    const project = (await agent.post('/api/projects').send({ name: 'Mine', projectKey: 'MINE' })).body.project;
    const ticket = (await agent.post(`/api/projects/${project.id}/tickets`).send({ title: 'Secret' })).body.ticket;
    const foreign = await createForeignOwner();
    const f = authed(app, foreign.cookie);
    const res = await f.get(`/api/tickets/${ticket.id}`);
    expect(res.status).toBe(404);
    const patch = await f.patch(`/api/tickets/${ticket.id}`).send({ version: 1, title: 'Hacked' });
    expect(patch.status).toBe(404);
  });
});
