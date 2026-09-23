import { z } from 'zod';
import { fileURLToPath } from 'node:url';
// Load apps/api/.env regardless of whether Node is launched from the workspace
// directory or from the repository root (as documented for cPanel/Passenger).
// Existing process variables still win over values in the file.
try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
}
catch {
    /* no apps/api/.env file — deployment may inject variables directly */
}
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // PORT=0 (or empty) falls back to the default; ephemeral ports are not useful here.
    PORT: z.preprocess((v) => (v === undefined || v === '' || v === '0' ? undefined : v), z.coerce.number().int().positive().default(4000)),
    DATABASE_URL: z.string().min(1),
    APP_URL: z.string().default('http://localhost:5173'),
    CORS_ORIGIN: z.string().optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
    WEB_DIST: z.string().optional(),
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    LOGIN_RATE_MAX: z.coerce.number().int().positive().default(10),
    LOGIN_RATE_WINDOW_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(15 * 60 * 1000),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
});
let cached = null;
export function getConfig() {
    if (cached)
        return cached;
    // Treat empty-string env vars as unset so defaults apply.
    const cleaned = Object.fromEntries(Object.entries(process.env).filter((entry) => entry[1] !== undefined && entry[1] !== ''));
    // Some cPanel/Passenger environments expose DSP_PORT instead of PORT.
    if (cleaned.PORT === undefined && cleaned.DSP_PORT !== undefined) {
        cleaned.PORT = cleaned.DSP_PORT;
    }
    const parsed = envSchema.safeParse(cleaned);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
    return cached;
}
/** Test hook so tests can construct isolated configs. */
export function resetConfigForTests() {
    cached = null;
}
export function isProduction(env = getConfig()) {
    return env.NODE_ENV === 'production';
}
export function cookieSecure(env = getConfig()) {
    if (env.COOKIE_SECURE !== undefined)
        return env.COOKIE_SECURE === 'true';
    return isProduction(env);
}
export function corsOrigin(env = getConfig()) {
    return env.CORS_ORIGIN ?? env.APP_URL;
}
//# sourceMappingURL=config.js.map