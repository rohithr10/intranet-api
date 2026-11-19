import type { Request } from 'express';
import { Permission } from '../models/Permission.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { ALL_PERMISSIONS } from '../utils/permissions.js';
import { slugify } from '../utils/slug.js';
import { recordActivity } from './activityService.js';

export async function listRoles() {
  const roles = await Role.find().sort({ isSuperAdmin: -1, isSystem: -1, name: 1 }).lean();
  const counts = await User.aggregate<{ _id: unknown; count: number }>([
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);
  const byRole = new Map(counts.map((c) => [String(c._id), c.count]));

  return roles.map((role) => ({
    ...role,
    permissions: role.isSuperAdmin ? [...ALL_PERMISSIONS] : (role.permissions ?? []),
    userCount: byRole.get(String(role._id)) ?? 0,
  }));
}

export async function getRole(id: string) {
  const role = await Role.findById(id).lean();
  if (!role) throw ApiError.notFound('Role not found');
  const userCount = await User.countDocuments({ role: role._id });
  return {
    ...role,
    permissions: role.isSuperAdmin ? [...ALL_PERMISSIONS] : (role.permissions ?? []),
    userCount,
  };
}

export async function listPermissions() {
  const permissions = await Permission.find().sort({ group: 1, key: 1 }).lean();
  // Group for the Permission Management screen.
  const groups = new Map<string, typeof permissions>();
  for (const permission of permissions) {
    const bucket = groups.get(permission.group) ?? [];
    bucket.push(permission);
    groups.set(permission.group, bucket);
  }
  return {
    items: permissions,
    groups: [...groups.entries()].map(([group, items]) => ({ group, items })),
  };
}

export interface RoleInput {
  name: string;
  key?: string;
  description?: string;
  permissions?: string[];
}

export async function createRole(req: Request, input: RoleInput) {
  const key = slugify(input.key ?? input.name);
  if (!key) throw ApiError.badRequest('A role key is required', { field: 'key' });
  if (await Role.exists({ key })) throw ApiError.conflict('A role with that key already exists', { field: 'key' });

  const permissions = await assertGrantablePermissions(req, input.permissions ?? []);

  const role = await Role.create({
    name: input.name,
    key,
    description: input.description ?? '',
    permissions,
    isSuperAdmin: false,
    isSystem: false,
  });

  await recordActivity(req, {
    action: 'roles.create',
    entity: 'Role',
    entityId: String(role._id),
    description: `Created role ${role.name} with ${permissions.length} permission(s)`,
  });

  return getRole(String(role._id));
}

export async function updateRole(req: Request, id: string, input: Partial<RoleInput>) {
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound('Role not found');
  if (role.isSuperAdmin) throw ApiError.badRequest('The super admin role always holds every permission and cannot be edited');

  if (input.name !== undefined) role.set('name', input.name);
  if (input.description !== undefined) role.set('description', input.description);
  if (input.key !== undefined && !role.isSystem) {
    const key = slugify(input.key);
    if (key !== role.key && (await Role.exists({ key }))) {
      throw ApiError.conflict('A role with that key already exists', { field: 'key' });
    }
    role.set('key', key);
  }

  let permissionsChanged = false;
  if (input.permissions !== undefined) {
    role.set('permissions', await assertGrantablePermissions(req, input.permissions));
    permissionsChanged = true;
  }

  await role.save();

  if (permissionsChanged) {
    // Everyone holding this role must pick up the new permission set now.
    await User.updateMany({ role: role._id }, { $inc: { tokenVersion: 1 } });
  }

  await recordActivity(req, {
    action: permissionsChanged ? 'roles.permissions.update' : 'roles.update',
    entity: 'Role',
    entityId: String(role._id),
    description: `Updated role ${role.name}`,
    meta: permissionsChanged ? { permissions: role.permissions } : {},
  });

  return getRole(String(role._id));
}

export async function deleteRole(req: Request, id: string) {
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound('Role not found');
  if (role.isSystem || role.isSuperAdmin) throw ApiError.badRequest('System roles cannot be deleted');

  const inUse = await User.countDocuments({ role: role._id });
  if (inUse > 0) {
    throw ApiError.conflict(`This role is assigned to ${inUse} user(s). Reassign them before deleting it.`);
  }

  await role.deleteOne();
  await recordActivity(req, {
    action: 'roles.delete',
    entity: 'Role',
    entityId: id,
    description: `Deleted role ${role.name}`,
  });
}

/**
 * Keeps the permission list honest: only keys that exist, and — for anyone who
 * is not a super admin — only keys the actor already holds. Without the second
 * check, a user with roles.assign could mint themselves a role with every
 * permission in the catalog.
 */
async function assertGrantablePermissions(req: Request, requested: string[]): Promise<string[]> {
  const actor = req.auth;
  if (!actor) throw ApiError.unauthorized();

  const unique = [...new Set(requested)];
  const known = new Set(ALL_PERMISSIONS as readonly string[]);
  const unknown = unique.filter((p) => !known.has(p));
  if (unknown.length > 0) {
    throw ApiError.badRequest(`Unknown permission(s): ${unknown.join(', ')}`, { field: 'permissions' });
  }

  if (!actor.isSuperAdmin) {
    const beyond = unique.filter((p) => !actor.permissions.has(p));
    if (beyond.length > 0) {
      throw ApiError.forbidden('You cannot grant permissions you do not hold yourself', {
        details: { beyond },
      });
    }
  }
  return unique;
}
