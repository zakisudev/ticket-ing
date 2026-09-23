import { z } from 'zod';

/** Email is normalized (trim + lowercase) before validation so storage stays canonical. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const passwordSchema = z.string().min(10).max(200);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});
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
export const SESSION_COOKIE_NAME = 'zt_session';
