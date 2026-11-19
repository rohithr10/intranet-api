import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { REFRESH_COOKIE } from '../utils/cookies.js';
import * as authService from '../services/authService.js';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await authService.login(req, res, email, password);
  res.json({ success: true, data: { user } });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req, res);
  res.json({ success: true, message: 'Signed out' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const user = await authService.currentUser(req.auth);
  res.json({ success: true, data: { user } });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No session to refresh', { code: 'NO_REFRESH_TOKEN' });
  const user = await authService.refresh(res, token);
  res.json({ success: true, data: { user } });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  await authService.changeOwnPassword(req, res, currentPassword, newPassword);
  res.json({ success: true, message: 'Password updated' });
});
