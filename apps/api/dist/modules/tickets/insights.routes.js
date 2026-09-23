import { z } from 'zod';
import { ApiError } from '../../lib/errors.js';
import { getFocus } from './insights.service.js';
/**
 * Global focus across ALL of the owner's projects:
 * GET /api/focus?projectId=<optional filter>
 * Mounted in app.ts with requireAuth.
 */
export async function globalFocusHandler(req, res, next) {
    try {
        const parsed = z.object({ projectId: z.string().uuid().optional() }).safeParse(req.query);
        if (!parsed.success) {
            throw ApiError.validation('Invalid focus query', parsed.error.flatten());
        }
        const focus = await getFocus(req.user.id, parsed.data.projectId);
        res.json(focus);
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=insights.routes.js.map