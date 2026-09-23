import pino from 'pino';
import { getConfig } from '../config.js';
/**
 * Operational logging only — product history lives in ticket_activities.
 * Redacted: anything that could carry credentials or session material.
 */
export const REDACT_PATHS = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers.set-cookie',
    'res.headers["set-cookie"]',
    'password',
    'passwordHash',
    'currentPassword',
    'newPassword',
    'token',
    'tokenHash',
    '*.password',
    '*.token',
    'DATABASE_URL',
];
let logger = null;
export function getLogger() {
    if (logger)
        return logger;
    const env = getConfig();
    logger = pino({
        level: env.LOG_LEVEL,
        redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
        base: { app: 'zakisu-tickets-api', env: env.NODE_ENV },
    }, process.stdout);
    return logger;
}
/** For tests: build a logger with an explicit level without touching env. */
export function testLogger(level = 'silent') {
    return pino({ level, redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } });
}
//# sourceMappingURL=logger.js.map