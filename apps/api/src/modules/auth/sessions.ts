import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { SESSION_COOKIE_NAME, type UserDto } from '@zakisu-tickets/shared';
import { getDb } from '../../db/client.js';
import { sessions, users } from '../../db/schema.js';
import { newId, sha256Hex } from '../../lib/ids.js';
import { ApiError } from '../../lib/errors.js';
import { cookieSecure, getConfig } from '../../config.js';
import { toMysqlDatetime, dbDatetimeToIso } from '../../lib/dates.js';

const SESSION_TTL_MS = () => getConfig().SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export function toUserDto(user: {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date | string;
}): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    createdAt: dbDatetimeToIso(user.createdAt) ?? new Date(0).toISOString(),
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS(),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
  });
}

/** Creates a DB session row and sets the cookie. */
export async function createSession(userId: string, res: Response): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const db = getDb();
  const expiresAt = toMysqlDatetime(new Date(Date.now() + SESSION_TTL_MS()));
  await db.insert(sessions).values({
    id: newId(),
    userId,
    tokenHash: sha256Hex(token),
    expiresAt,
  });
  setSessionCookie(res, token);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name: string | null; createdAt: string };
  }
  }
}

/** 401 unless the session cookie resolves to a live session + user. */
export async function requireAuth(req: Request, _res: Response, _next: NextFunction) {
  try {
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE_NAME];
    if (!token) throw ApiError.unauthenticated();
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256Hex(token)), gt(sessions.expiresAt, toMysqlDatetime(new Date()))))
      .limit(1);
    const user = rows[0];
    if (!user) throw ApiError.unauthenticated();
    req.user = toUserDto(user);
    _next();
  } catch (err) {
    _next(err);
  }
}
