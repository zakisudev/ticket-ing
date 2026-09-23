import type { ErrorCode } from './enums.js';
/** Envelope for every API error response. */
export interface ApiErrorBody {
    error: {
        code: ErrorCode;
        message: string;
        details?: unknown;
    };
}
export declare function apiError(code: ErrorCode, message: string, details?: unknown): ApiErrorBody;
export declare const STALE_UPDATE_MESSAGE = "This ticket was updated elsewhere.";
//# sourceMappingURL=errors.d.ts.map