import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { paginate } from '../utils/pagination.js';
import * as userService from '../services/userService.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as userService.UserListQuery;
  const { items, total } = await userService.listUsers(query);
  res.json({ success: true, data: paginate(items, total, query) });
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getUser(req.params.id as string);
  res.json({ success: true, data: { user } });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.createUser(req, req.body as userService.CreateUserInput);
  res.status(201).json({ success: true, data: { user }, message: 'User created' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.updateUser(req, req.params.id as string, req.body as userService.UpdateUserInput);
  res.json({ success: true, data: { user }, message: 'User updated' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await userService.deleteUser(req, req.params.id as string);
  res.json({ success: true, message: 'User deleted' });
});

export const assignRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body as { role: string };
  const user = await userService.updateUser(req, req.params.id as string, { role });
  res.json({ success: true, data: { user }, message: 'Role assigned' });
});

/** Public people directory behind the portal's Search / Directory dialog. */
export const directory = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as { search?: string; field: 'name' | 'department' | 'country'; limit: number };
  const people = await userService.listDirectory(query);
  res.json({ success: true, data: { people } });
});
