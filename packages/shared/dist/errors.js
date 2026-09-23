export function apiError(code, message, details) {
    return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}
export const STALE_UPDATE_MESSAGE = 'This ticket was updated elsewhere.';
//# sourceMappingURL=errors.js.map