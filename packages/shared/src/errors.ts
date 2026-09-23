import type { ErrorCode } from './enums.js';

/** Envelope for every API error response. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export function apiError(
  code: ErrorCode,
  message: string,
  details?: unknown
): ApiErrorBody {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

export const STALE_UPDATE_MESSAGE = 'This ticket was updated elsewhere.';
