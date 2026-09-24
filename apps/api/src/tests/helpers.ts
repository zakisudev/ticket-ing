import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { getPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { newId, sha256Hex } from '../lib/ids.js';
import { toMysqlDatetime } from '../lib/dates.js';
import { hashPassword } from '../modules/auth/passwords.js';

let migrated: Promise<void> | null = null;

/** Applies migrations once per test run (idempotent). */
export async function ensureMigrated(): Promise<void> {
  if (!migrated) migrated = runMigrations();
  await migrated;
}

const TRUNCATE_ORDER = [
  'ticket_activities',
  'ticket_checklist_items',
  'ticket_links',
  'ticket_relations',
  'ticket_tags',
  'tags',
  'tickets',
  'project_ticket_counters',
  'projects',
  'sessions',
  'users',
];

export async function truncateAll(): Promise<void> {
  const pool = getPool();
  await pool.query('SET FOREIGN_KEY_CHECKS=0');
  for (const table of TRUNCATE_ORDER) {
    await pool.query(`TRUNCATE TABLE ${table}`);
  }
  await pool.query('SET FOREIGN_KEY_CHECKS=1');
}

export interface TestOwner {
  id: string;
  email: string;
  /** Request factory with the session cookie attached. */
  agent: ReturnType<typeof authed>;
}

/** Registers a user through the public API and returns an authenticated agent. */
export async function registerOwner(
  app: Express,
  email = 'owner@zakisu.test',
  password = 'owner-password-1',
): Promise<TestOwner> {
  const res = await request(app).post('/api/auth/register').send({ email, password });
  if (res.status !== 201) {
    throw new Error(`registerOwner failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { id: res.body.user.id, email, agent: authed(app, res.headers['set-cookie']) };
}

/** A request factory bound to a session cookie. */
export function authed(app: Express, cookie: string | string[]) {
  const flat = (Array.isArray(cookie) ? cookie : [cookie]).map((c) => c.split(';')[0]).join('; ');
  return {
    get: (url: string) => request(app).get(url).set('Cookie', flat),
    post: (url: string) => request(app).post(url).set('Cookie', flat),
    patch: (url: string) => request(app).patch(url).set('Cookie', flat),
    delete: (url: string) => request(app).delete(url).set('Cookie', flat),
  };
}

export function agentFromResponse(
  app: Express,
  setCookieHeader: string | string[],
): ReturnType<typeof authed> {
  return authed(app, setCookieHeader);
}

export { request };

/** Inserts an isolated user/session directly for focused authorization tests. */
export async function createForeignOwner(
  email = 'foreigner@zakisu.test',
): Promise<{ id: string; cookie: string }> {
  const pool = getPool();
  const id = newId();
  const hash = await hashPassword('foreigner-password-1');
  await pool.execute('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [
    id,
    email,
    hash,
  ]);
  const token = `foreign-token-${randomUUID()}`;
  await pool.execute(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [newId(), id, sha256Hex(token), toMysqlDatetime(new Date(Date.now() + 86400_000))],
  );
  return { id, cookie: `zt_session=${token}` };
}
