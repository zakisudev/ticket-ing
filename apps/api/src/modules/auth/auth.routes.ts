import { Router } from 'express';
import { eq } from 'drizzle-orm';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  SESSION_COOKIE_NAME,
  type RegistrationStatusDto,
  type UserDto,
} from '@zakisu-tickets/shared';
import { getDb, getPool } from '../../db/client.js';
import { sessions, users } from '../../db/schema.js';
import { newId, sha256Hex } from '../../lib/ids.js';
import { ApiError } from '../../lib/errors.js';
import { getConfig } from '../../config.js';
import { getLogger } from '../../lib/logger.js';
import { createSession, clearSessionCookie, requireAuth, toUserDto } from './sessions.js';
import { hashPassword, verifyPassword } from './passwords.js';

export const authRouter = Router();

// ---------------------------------------------------------------------------
// Login rate limiting: per-IP+email failure counters, in-memory (single process).
// ---------------------------------------------------------------------------
interface Attempt {
  count: number;
  resetAt: number;
}
const failedLogins = new Map<string, Attempt>();
const registrationAttempts = new Map<string, Attempt>();
let nowFn: () => number = Date.now;

export function __setNowForTests(fn: () => number): void {
  nowFn = fn;
}
export function __resetLoginRateLimiterForTests(): void {
  failedLogins.clear();
}
export function __resetRegistrationRateLimiterForTests(): void {
  registrationAttempts.clear();
}

function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

function rateLimitKey(req: { ip?: string }, email: string): string {
  return `${clientIp(req)}|${email}`;
}

function assertNotRateLimited(req: { ip?: string }, email: string): void {
  const key = rateLimitKey(req, email);
  const attempt = failedLogins.get(key);
  if (attempt && attempt.resetAt > nowFn() && attempt.count >= getConfig().LOGIN_RATE_MAX) {
    throw ApiError.rateLimited('Too many failed login attempts. Try again later.');
  }
}

function recordLoginFailure(req: { ip?: string }, email: string): void {
  const key = rateLimitKey(req, email);
  const now = nowFn();
  const attempt = failedLogins.get(key);
  if (!attempt || attempt.resetAt <= now) {
    failedLogins.set(key, { count: 1, resetAt: now + getConfig().LOGIN_RATE_WINDOW_MS });
  } else {
    attempt.count += 1;
  }
}

function clearLoginFailures(req: { ip?: string }, email: string): void {
  failedLogins.delete(rateLimitKey(req, email));
}

function consumeRegistrationAttempt(req: { ip?: string; socket?: { remoteAddress?: string } }): void {
  const key = clientIp(req);
  const now = nowFn();
  const attempt = registrationAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    registrationAttempts.set(key, {
      count: 1,
      resetAt: now + getConfig().REGISTRATION_RATE_WINDOW_MS,
    });
    return;
  }
  if (attempt.count >= getConfig().REGISTRATION_RATE_MAX) {
    throw ApiError.rateLimited('Too many registration attempts. Try again later.');
  }
  attempt.count += 1;
}

// Auth events are logged by category only — never emails, tokens, or passwords.
function logAuth(category: string): void {
  getLogger().info({ category }, 'auth.event');
}

/** Precomputed hash so unknown-email logins burn comparable CPU (timing equalization). */
const DUMMY_HASH_PROMISE = hashPassword('zakisu-tickets-dummy-verify');

// ---------------------------------------------------------------------------
// Login — generic failure message always; per-IP+email rate limiting.
// ---------------------------------------------------------------------------
authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.validation('Invalid login payload', parsed.error.flatten());
    }
    const { email, password } = parsed.data;

    assertNotRateLimited(req, email);

    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];

    // Uniform failure path: same message/timing whether email or password is wrong.
    const dummyHash = await DUMMY_HASH_PROMISE;
    const passwordOk = user
      ? await verifyPassword(user.passwordHash, password)
      : await verifyPassword(dummyHash, password);
    if (!user || !passwordOk) {
      recordLoginFailure(req, email);
      logAuth('auth.login.failure');
      throw ApiError.unauthenticated('Invalid email or password');
    }

    clearLoginFailures(req, email);
    await createSession(user.id, res);
    logAuth('auth.login.success');
    const userDto: UserDto = toUserDto(user);
    res.json({ user: userDto });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (token) {
      await getDb()
        .delete(sessions)
        .where(eq(sessions.tokenHash, sha256Hex(token)));
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// ---------------------------------------------------------------------------
// Change password — requires current password, rotates ALL sessions and issues
// one fresh session to the calling browser (documented behavior choice).
// ---------------------------------------------------------------------------
authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.validation('Invalid change-password payload', parsed.error.flatten());
    }
    const { currentPassword, newPassword } = parsed.data;

    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    const user = rows[0];
    if (!user) throw ApiError.unauthenticated();

    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) {
      logAuth('auth.change_password.failure');
      throw ApiError.unauthenticated('Current password is incorrect');
    }

    const passwordHash = await hashPassword(newPassword);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
      // Rotate: invalidate every existing session, then mint one for this browser.
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
    });

    await createSession(user.id, res);
    logAuth('auth.change_password.success');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Registration — open by default so each user can create an isolated workspace.
// Operators can close it with REGISTRATION_MODE=closed. Per-IP rate limiting
// protects the expensive Argon2 path; users.email UNIQUE handles duplicate races.
// ---------------------------------------------------------------------------
authRouter.get('/registration-status', (_req, res) => {
  const body: RegistrationStatusDto = { open: getConfig().REGISTRATION_MODE === 'open' };
  res.json(body);
});

authRouter.post('/register', async (req, res, next) => {
  try {
    if (getConfig().REGISTRATION_MODE !== 'open') {
      throw ApiError.conflict('Registration is closed');
    }
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.validation('Invalid registration payload', parsed.error.flatten());
    }
    const { email, password, name } = parsed.data;
    consumeRegistrationAttempt(req);

    const passwordHash = await hashPassword(password);
    const userId = newId();
    try {
      await getPool().execute(
        'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
        [userId, email, passwordHash, name ?? null],
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw ApiError.conflict('An account with this email already exists');
      }
      throw err;
    }

    // Every new account is authenticated immediately after registration.
    await createSession(userId, res);
    logAuth('auth.register.success');
    res
      .status(201)
      .json({ user: toUserDto({ id: userId, email, name: name ?? null, createdAt: new Date() }) });
  } catch (err) {
    next(err);
  }
});
