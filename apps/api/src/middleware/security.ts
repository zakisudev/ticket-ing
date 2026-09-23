import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { corsOrigin, isProduction } from '../config.js';

/**
 * Strict CSP compatible with the Vite production bundle:
 * - default-src 'self'        — everything from our own origin
 * - style-src 'self' 'unsafe-inline' — Tailwind/Vite inject small inline styles
 * - img-src 'self' data:      — data: for small inline assets
 * - connect-src 'self'        — API calls are same-origin
 * No script-src relaxation: the Vite bundle is fully externalized.
 */
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'"],
  fontSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  upgradeInsecureRequests: [],
} as const;

export function buildSecurityMiddleware() {
  const csp = (() => {
    const d = CSP_DIRECTIVES;
    const parts = [
      `default-src ${d.defaultSrc.join(' ')}`,
      `script-src ${d.scriptSrc.join(' ')}`,
      `style-src ${d.styleSrc.join(' ')}`,
      `img-src ${d.imgSrc.join(' ')}`,
      `connect-src ${d.connectSrc.join(' ')}`,
      `font-src ${d.fontSrc.join(' ')}`,
      `object-src ${d.objectSrc.join(' ')}`,
      `base-uri ${d.baseUri.join(' ')}`,
      `form-action ${d.formAction.join(' ')}`,
      `frame-ancestors ${d.frameAncestors.join(' ')}`,
    ];
    if (isProduction()) parts.push('upgrade-insecure-requests');
    return parts.join('; ');
  })();

  const helmetMiddleware = helmet({
    contentSecurityPolicy: false, // we set the header ourselves below (single source of truth)
    crossOriginEmbedderPolicy: false,
  });

  const cspMiddleware = (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', csp);
    next();
  };

  const corsMiddleware = cors({
    origin: corsOrigin(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  // Defense-in-depth for state-changing requests: same-origin browser requests
  // carry an Origin header matching the app; API clients without Origin are
  // allowed (server-to-server); mismatches are rejected (CSRF vector).
  const originCheck = (req: Request, res: Response, next: NextFunction) => {
    if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next(); // non-browser client
    const allowed = corsOrigin();
    if (origin !== allowed) {
      return res.status(403).json({
        error: { code: 'CONFLICT', message: 'Cross-origin request rejected' },
      });
    }
    return next();
  };

  return [helmetMiddleware, cspMiddleware, corsMiddleware, originCheck] as const;
}
