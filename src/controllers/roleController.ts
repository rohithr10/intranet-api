import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as roleService from '../services/roleService.js';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const roles = await roleService.listRoles();
  res.json({ success: true, data: { roles } });
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const role = await roleService.getRole(req.params.id as string);
  res.json({ success: true, data: { role } });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const role = await roleService.createRole(req, req.body as roleService.RoleInput);
  res.status(201).json({ success: true, data: { role }, message: 'Role created' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const role = await roleService.updateRole(req, req.params.id as string, req.body as roleService.RoleInput);
  res.json({ success: true, data: { role }, message: 'Role updated' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await roleService.deleteRole(req, req.params.id as string);
  res.json({ success: true, message: 'Role deleted' });
});

export const setPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { permissions } = req.body as { permissions: string[] };
  const role = await roleService.updateRole(req, req.params.id as string, { permissions });
  res.json({ success: true, data: { role }, message: 'Permissions updated' });
});

export const permissions = asyncHandler(async (_req: Request, res: Response) => {
  const data = await roleService.listPermissions();
  res.json({ success: true, data });
});
