import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { closePool } from '../db/client.js';
import { ensureMigrated } from './helpers.js';

const app = createApp();

beforeAll(async () => {
  await ensureMigrated();
});

afterAll(async () => {
  await closePool();
});

function expectDynamicNoStore(response: request.Response): void {
  const cacheControl = response.headers['cache-control'] ?? '';
  expect(cacheControl).toContain('no-store');
  expect(cacheControl).toContain('private');
  expect(cacheControl).not.toContain('public');
  expect(cacheControl).not.toContain('max-age=2592000');
  expect(response.headers.pragma).toBe('no-cache');
  expect(response.headers.expires).toBe('0');
}

describe('dynamic response cache policy', () => {
  it.each([
    '/api/auth/me',
    '/api/auth/registration-status',
    '/api/projects',
    '/api/focus',
    '/health',
    '/health/ready',
  ])('marks GET %s as private and non-cacheable', async (path) => {
    const response = await request(app).get(path);
    expectDynamicNoStore(response);
  });

  it.each([
    ['/api/auth/login', { email: 'nobody@zakisu.test', password: 'invalid-password-1' }],
    ['/api/auth/logout', undefined],
    [
      '/api/auth/change-password',
      {
        currentPassword: 'invalid-password-1',
        newPassword: 'replacement-password-1',
      },
    ],
  ] as const)('marks POST %s as private and non-cacheable', async (path, body) => {
    const pending = request(app).post(path);
    const response = body === undefined ? await pending : await pending.send(body);
    expectDynamicNoStore(response);
  });

  it('varies API responses by Cookie as defense in depth', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.headers.vary).toContain('Cookie');
  });
});

describe('static response cache policy', () => {
  it('keeps the SPA entrypoint revalidation-oriented', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-cache');
    expect(response.headers['cache-control']).not.toContain('immutable');
  });

  it('keeps fingerprinted assets long-lived', async () => {
    const assetsDir = fileURLToPath(new URL('../../../web/dist/assets/', import.meta.url));
    const asset = readdirSync(assetsDir).find((name) => /-[A-Za-z0-9_-]+\.js$/.test(name));
    expect(asset).toBeDefined();

    const response = await request(app).get(`/assets/${asset}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('max-age=31536000');
  });
});
