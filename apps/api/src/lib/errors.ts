import type { ErrorCode } from '@zakisu-tickets/shared';

/** Transportable application error carrying the shared error contract. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static validation(message = 'Validation failed', details?: unknown) {
    return new ApiError('VALIDATION_ERROR', 422, message, details);
  }
  static unauthenticated(message = 'Authentication required') {
    return new ApiError('UNAUTHENTICATED', 401, message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError('NOT_FOUND', 404, message);
  }
  static conflict(message = 'Conflict', details?: unknown) {
    return new ApiError('CONFLICT', 409, message, details);
  }
  static staleUpdate() {
    return new ApiError('STALE_UPDATE', 409, 'This ticket was updated elsewhere.');
  }
  static rateLimited(message = 'Too many requests', details?: unknown) {
    return new ApiError('RATE_LIMITED', 429, message, details);
  }
}
