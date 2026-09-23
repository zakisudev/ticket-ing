import type { Request, Response, NextFunction } from 'express';
import { apiError } from '@zakisu-tickets/shared';
import { ApiError } from '../lib/errors.js';
import { getLogger } from '../lib/logger.js';
import { isProduction } from '../config.js';

interface MysqlError {
  code?: string;
  sqlMessage?: string;
}

/** Maps known DB constraint violations to friendly conflict errors. */
function mapDatabaseError(err: unknown): ApiError | null {
  // Drizzle wraps driver errors in DrizzleQueryError; the driver error is on cause.
  const cause = (err as { cause?: MysqlError })?.cause ?? (err as MysqlError);
  if (cause?.code === 'ER_DUP_ENTRY') {
    return ApiError.conflict('A resource with these unique values already exists');
  }
  return null;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    if (err.status >= 500) {
      getLogger().error({ err, path: req.path }, 'api.error');
    }
    res.status(err.status).json(apiError(err.code, err.message, err.details));
    return;
  }

  const mapped = mapDatabaseError(err as MysqlError);
  if (mapped) {
    res.status(mapped.status).json(apiError(mapped.code, mapped.message));
    return;
  }

  getLogger().error({ err, path: req.path }, 'api.unexpected_error');
  res.status(500).json(
    apiError(
      'INTERNAL_ERROR',
      isProduction() ? 'Internal server error' : String((err as Error)?.message ?? err)
    )
  );
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(apiError('NOT_FOUND', 'Route not found'));
}
