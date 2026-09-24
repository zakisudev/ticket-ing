import { z } from 'zod';
/** Email is normalized (trim + lowercase) before validation so storage stays canonical. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const passwordSchema = z.string().min(10).max(200);
export const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    name: z
        .string()
        .trim()
        .max(100)
        .transform((value) => value || undefined)
        .optional(),
});
export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1).max(200),
});
export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(200),
    newPassword: passwordSchema,
});
/** HTTP-only cookie holding the opaque session token. */
export const SESSION_COOKIE_NAME = 'zt_session';
//# sourceMappingURL=auth.js.map