import { apiError } from '@zakisu-tickets/shared';
import { ApiError } from '../lib/errors.js';
import { getLogger } from '../lib/logger.js';
import { isProduction } from '../config.js';
/** Maps known DB constraint violations to friendly conflict errors. */
function mapDatabaseError(err) {
    // Drizzle wraps driver errors in DrizzleQueryError; the driver error is on cause.
    const cause = err?.cause ?? err;
    if (cause?.code === 'ER_DUP_ENTRY') {
        return ApiError.conflict('A resource with these unique values already exists');
    }
    return null;
}
export function errorHandler(err, req, res, _next) {
    if (err instanceof ApiError) {
        if (err.status >= 500) {
            getLogger().error({ err, path: req.path }, 'api.error');
        }
        res.status(err.status).json(apiError(err.code, err.message, err.details));
        return;
    }
    const mapped = mapDatabaseError(err);
    if (mapped) {
        res.status(mapped.status).json(apiError(mapped.code, mapped.message));
        return;
    }
    getLogger().error({ err, path: req.path }, 'api.unexpected_error');
    res.status(500).json(apiError('INTERNAL_ERROR', isProduction() ? 'Internal server error' : String(err?.message ?? err)));
}
export function notFoundHandler(_req, res) {
    res.status(404).json(apiError('NOT_FOUND', 'Route not found'));
}
//# sourceMappingURL=errorHandler.js.map