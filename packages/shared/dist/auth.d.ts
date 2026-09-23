import { z } from 'zod';
/** Email is normalized (trim + lowercase) before validation so storage stays canonical. */
export declare const emailSchema: z.ZodPipe<z.ZodString, z.ZodEmail>;
export declare const passwordSchema: z.ZodString;
export declare const registerSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodEmail>;
    password: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type RegisterInput = z.infer<typeof registerSchema>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodEmail>;
    password: z.ZodString;
}, z.core.$strip>;
export type LoginInput = z.infer<typeof loginSchema>;
export declare const changePasswordSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, z.core.$strip>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
/** Never includes passwordHash. */
export interface UserDto {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
}
export interface RegistrationStatusDto {
    /** true only while zero users exist (or an explicit override is set server-side). */
    open: boolean;
}
/** HTTP-only cookie holding the opaque session token. */
export declare const SESSION_COOKIE_NAME = "zt_session";
//# sourceMappingURL=auth.d.ts.map