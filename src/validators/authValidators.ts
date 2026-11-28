import { z } from 'zod';
import { email, password } from './common.js';

export const loginSchema = z.object({
  email,
  // Deliberately not `password` — the strength rules apply when setting a
  // password, not when checking an existing one.
  password: z.string().min(1, 'Password is required').max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Your current password is required'),
    newPassword: password,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Your new password must be different from the current one',
    path: ['newPassword'],
  });

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(16, 'Reset token is invalid').max(256),
  newPassword: password,
});
