import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { getPool } from './db/client.js';
import { getLogger } from './lib/logger.js';
import { buildSecurityMiddleware } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { requireAuth } from './modules/auth/sessions.js';
import { projectsRouter } from './modules/projects/projects.routes.js';
import { globalFocusHandler } from './modules/tickets/insights.routes.js';
import { projectTicketsRouter, ticketsRouter } from './modules/tickets/tickets.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(): Express {
  const app = express();
  const env = getConfig();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const [helmetMw, cspMw, corsMw, originCheck] = buildSecurityMiddleware();
  app.use(helmetMw);
  app.use(cspMw);
  app.use(corsMw);
  app.use(originCheck);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // --- health -------------------------------------------------------------
  app.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await getPool().query('SELECT 1');
      res.json({ ok: true, database: 'up' });
    } catch {
      // Never leak connection details.
      res.status(503).json({ ok: false, database: 'unavailable' });
    }
  });

  // --- api ------------------------------------------------------------------
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/projects', projectTicketsRouter);
  app.use('/api/tickets', ticketsRouter);
  app.get('/api/focus', requireAuth, globalFocusHandler);

  app.use('/api', notFoundHandler);

  // --- production static SPA ------------------------------------------------
  const webDist = env.WEB_DIST
    ? join(process.cwd(), env.WEB_DIST)
    : join(__dirname, '../../web/dist');
  const indexHtml = join(webDist, 'index.html');

  if (existsSync(indexHtml)) {
    app.use(express.static(webDist, { index: false, maxAge: '1y', setHeaders: (res, path) => {
      if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }}));
    // SPA fallback for client-side routes (excluding /api and /health).
    // Pattern-less middleware: Express 5 path-to-regexp no longer accepts '*'.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/health')) {
        return next();
      }
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}

export function start(): void {
  const env = getConfig();
  const log = getLogger();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    log.info({ port: env.PORT, env: env.NODE_ENV }, 'server.started');
  });

  const shutdown = (signal: string) => {
    log.info({ signal }, 'server.shutdown');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
