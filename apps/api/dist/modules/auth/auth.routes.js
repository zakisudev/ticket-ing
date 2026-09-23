import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { changePasswordSchema, loginSchema, registerSchema, SESSION_COOKIE_NAME, } from '@zakisu-tickets/shared';
import { getDb, getPool } from '../../db/client.js';
import { sessions, users } from '../../db/schema.js';
import { newId, sha256Hex } from '../../lib/ids.js';
import { ApiError } from '../../lib/errors.js';
import { getConfig } from '../../config.js';
import { getLogger } from '../../lib/logger.js';
import { createSession, clearSessionCookie, requireAuth, toUserDto } from './sessions.js';
import { hashPassword, verifyPassword } from './passwords.js';
export const authRouter = Router();
const failedLogins = new Map();
let nowFn = Date.now;
export function __setNowForTests(fn) {
    nowFn = fn;
}
export function __resetLoginRateLimiterForTests() {
    failedLogins.clear();
}
function clientIp(req) {
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
function rateLimitKey(req, email) {
    return `${clientIp(req)}|${email}`;
}
function assertNotRateLimited(req, email) {
    const key = rateLimitKey(req, email);
    const attempt = failedLogins.get(key);
    if (attempt && attempt.resetAt > nowFn() && attempt.count >= getConfig().LOGIN_RATE_MAX) {
        throw ApiError.rateLimited('Too many failed login attempts. Try again later.');
    }
}
function recordLoginFailure(req, email) {
    const key = rateLimitKey(req, email);
    const now = nowFn();
    const attempt = failedLogins.get(key);
    if (!attempt || attempt.resetAt <= now) {
        failedLogins.set(key, { count: 1, resetAt: now + getConfig().LOGIN_RATE_WINDOW_MS });
    }
    else {
        attempt.count += 1;
    }
}
function clearLoginFailures(req, email) {
    failedLogins.delete(rateLimitKey(req, email));
}
// Auth events are logged by category only — never emails, tokens, or passwords.
function logAuth(category) {
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
        const userDto = toUserDto(user);
        res.json({ user: userDto });
    }
    catch (err) {
        next(err);
    }
});
authRouter.post('/logout', async (req, res, next) => {
    try {
        const token = req.cookies?.[SESSION_COOKIE_NAME];
        if (token) {
            await getDb()
                .delete(sessions)
                .where(eq(sessions.tokenHash, sha256Hex(token)));
        }
        clearSessionCookie(res);
        res.json({ ok: true });
    }
    catch (err) {
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
        const rows = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
        const user = rows[0];
        if (!user)
            throw ApiError.unauthenticated();
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
    }
    catch (err) {
        next(err);
    }
});
// ---------------------------------------------------------------------------
// Registration — open ONLY while zero users exist.
// Race protection: MySQL advisory lock GET_LOCK serializes concurrent first-user
// creation; COUNT(*) is re-checked INSIDE the lock+transaction; users.email UNIQUE
// is the database-level backstop. Two simultaneous requests => exactly one owner.
// ---------------------------------------------------------------------------
const REGISTRATION_LOCK = 'zakisu:tickets:registration';
authRouter.get('/registration-status', async (_req, res, next) => {
    try {
        const [rows] = await getPool().query('SELECT COUNT(*) AS count FROM users');
        const open = Number(rows[0]?.count ?? 0) === 0;
        const body = { open };
        res.json(body);
    }
    catch (err) {
        next(err);
    }
});
authRouter.post('/register', async (req, res, next) => {
    try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            throw ApiError.validation('Invalid registration payload', parsed.error.flatten());
        }
        const { email, password, name } = parsed.data;
        const conn = await getPool().getConnection();
        let userId = '';
        try {
            await conn.beginTransaction();
            const [lockRows] = await conn.query('SELECT GET_LOCK(?, 5) AS lockAcquired', [REGISTRATION_LOCK]);
            if (Number(lockRows[0].lockAcquired) !== 1) {
                throw ApiError.conflict('Registration is busy; retry momentarily');
            }
            const [countRows] = await conn.query('SELECT COUNT(*) AS count FROM users');
            if (Number(countRows[0].count) > 0) {
                throw ApiError.conflict('Registration is closed');
            }
            const passwordHash = await hashPassword(password);
            userId = newId();
            await conn.execute('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)', [
                userId,
                email,
                passwordHash,
                name ?? null,
            ]);
            await conn.query('SELECT RELEASE_LOCK(?)', [REGISTRATION_LOCK]);
            await conn.commit();
        }
        catch (err) {
            await conn.query('SELECT RELEASE_LOCK(?)', [REGISTRATION_LOCK]);
            await conn.rollback();
            throw err;
        }
        finally {
            conn.release();
        }
        // The first owner is authenticated immediately after registration.
        await createSession(userId, res);
        logAuth('auth.register.success');
        res
            .status(201)
            .json({ user: toUserDto({ id: userId, email, name: name ?? null, createdAt: new Date() }) });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=auth.routes.js.map