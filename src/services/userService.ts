import type { Request } from 'express';
import { env } from '../config/environment.js';
import { Role } from '../models/Role.js';
import { User, hashPassword } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { isMailConfigured, sendPasswordResetEmail } from '../utils/mailer.js';
import { logger } from '../utils/logger.js';
import { escapeRegex } from '../utils/sanitize.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { recordActivity } from './activityService.js';
import { assignPasswordResetToken } from './authService.js';
import type { UserStatus } from '../types/domain.js';

const PUBLIC_FIELDS =
  'name email role status department country jobTitle phone showInDirectory lastLoginAt mustChangePassword passwordResetRequestedAt createdAt updatedAt';

export interface UserListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: UserStatus;
  role?: string;
  sort?: string;
}

export async function listUsers(query: UserListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.role) filter.role = query.role;
  if (query.search) {
    const needle = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: needle }, { email: needle }, { department: needle }, { country: needle }];
  }

  const sort: Record<string, 1 | -1> = query.sort === 'name' ? { name: 1 } : { createdAt: -1 };

  const [items, total] = await Promise.all([
    User.find(filter)
      .select(PUBLIC_FIELDS)
      .populate('role', 'name key isSuperAdmin')
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return { items: items.map((u) => ({ ...u, initials: initialsOf(u.name) })), total };
}

export async function getUser(id: string) {
  const user = await User.findById(id)
    .select(PUBLIC_FIELDS)
    .populate('role', 'name key isSuperAdmin permissions')
    .lean();
  if (!user) throw ApiError.notFound('User not found');
  return { ...user, initials: initialsOf(user.name) };
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: string;
  status?: UserStatus;
  department?: string;
  country?: string;
  jobTitle?: string;
  phone?: string;
  showInDirectory?: boolean;
  mustChangePassword?: boolean;
}

export async function createUser(req: Request, input: CreateUserInput) {
  const role = await assertAssignableRole(req, input.role);

  const existing = await User.exists({ email: input.email.toLowerCase() });
  if (existing) throw ApiError.conflict('That email address is already registered', { field: 'email' });

  const created = await User.create({
    ...input,
    email: input.email.toLowerCase(),
    passwordHash: await hashPassword(input.password),
    role: role._id,
    createdBy: req.auth?.userId ?? null,
  });

  await recordActivity(req, {
    action: 'users.create',
    entity: 'User',
    entityId: String(created._id),
    description: `Created user ${created.name} (${created.email}) as ${role.name}`,
  });

  return getUser(String(created._id));
}

export type UpdateUserInput = Partial<Omit<CreateUserInput, 'password'>> & { password?: string };

export async function updateUser(req: Request, id: string, input: UpdateUserInput) {
  const user = await User.findById(id).populate('role', 'name key isSuperAdmin');
  if (!user) throw ApiError.notFound('User not found');

  const actor = req.auth;
  if (!actor) throw ApiError.unauthorized();
  const isSelf = actor.userId === String(user._id);

  // Privilege-escalation guards. A user must not be able to widen their own
  // access, and a non-super-admin must not be able to touch a super admin or
  // hand out a super-admin role (checked in assertAssignableRole).
  if (isSelf && input.role && input.role !== String(user.role?._id)) {
    throw ApiError.forbidden('You cannot change your own role');
  }
  if (isSelf && input.status && input.status !== user.status) {
    throw ApiError.forbidden('You cannot change your own account status');
  }
  const targetIsSuperAdmin = Boolean((user.role as { isSuperAdmin?: boolean } | null)?.isSuperAdmin);
  if (targetIsSuperAdmin && !actor.isSuperAdmin) {
    throw ApiError.forbidden('Only a super admin can modify a super admin account');
  }

  if (input.email && input.email.toLowerCase() !== user.email) {
    const clash = await User.exists({ email: input.email.toLowerCase(), _id: { $ne: user._id } });
    if (clash) throw ApiError.conflict('That email address is already registered', { field: 'email' });
    user.set('email', input.email.toLowerCase());
  }

  if (input.role) {
    const role = await assertAssignableRole(req, input.role);
    if (String(role._id) !== String(user.role?._id)) {
      user.set('role', role._id);
      // Permissions just changed: force a re-authentication so no old token
      // keeps the previous role's access.
      user.set('tokenVersion', (user.get('tokenVersion') ?? 0) + 1);
    }
  }

  if (input.password) {
    user.set('passwordHash', await hashPassword(input.password));
    user.set('passwordResetTokenHash', null);
    user.set('passwordResetExpiresAt', null);
    user.set('passwordResetRequestedAt', null);
    user.set('tokenVersion', (user.get('tokenVersion') ?? 0) + 1);
  }

  for (const key of ['name', 'status', 'department', 'country', 'jobTitle', 'phone', 'showInDirectory', 'mustChangePassword'] as const) {
    if (input[key] !== undefined) user.set(key, input[key]);
  }

  // Deactivating an account must end its live sessions, not just block new ones.
  if (input.status && input.status !== 'active') {
    user.set('tokenVersion', (user.get('tokenVersion') ?? 0) + 1);
  }

  await user.save();

  await recordActivity(req, {
    action: 'users.update',
    entity: 'User',
    entityId: String(user._id),
    description: `Updated user ${user.name}`,
    meta: { fields: Object.keys(input).filter((k) => k !== 'password') },
  });

  return getUser(String(user._id));
}

export async function createPasswordResetLink(
  req: Request,
  id: string,
  options: { sendEmail?: boolean } = {},
): Promise<{ resetUrl: string; expiresAt: Date; emailed: boolean; mailConfigured: boolean }> {
  const actor = req.auth;
  if (!actor) throw ApiError.unauthorized();

  const user = await User.findById(id).populate('role', 'name key isSuperAdmin');
  if (!user) throw ApiError.notFound('User not found');

  const targetIsSuperAdmin = Boolean((user.role as { isSuperAdmin?: boolean } | null)?.isSuperAdmin);
  if (targetIsSuperAdmin && !actor.isSuperAdmin) {
    throw ApiError.forbidden('Only a super admin can reset a super admin account');
  }

  if (user.status !== 'active') {
    throw ApiError.badRequest('Activate this account before issuing a password reset link');
  }

  const { resetUrl, expiresAt } = assignPasswordResetToken(user, req);
  await user.save({ validateModifiedOnly: true });

  const mailConfigured = isMailConfigured();
  let emailed = false;
  if (options.sendEmail && mailConfigured) {
    try {
      emailed = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
        expiresMinutes: env.passwordReset.ttlMinutes,
      });
    } catch (err) {
      logger.error(`Failed to email admin reset link to ${user.email}`, err);
    }
  }

  await recordActivity(req, {
    action: 'users.reset_link',
    entity: 'User',
    entityId: String(user._id),
    description: `Generated password reset link for ${user.name}${emailed ? ' and sent email' : ''}`,
  });

  return { resetUrl, expiresAt, emailed, mailConfigured };
}

export async function deleteUser(req: Request, id: string) {
  const actor = req.auth;
  if (!actor) throw ApiError.unauthorized();
  if (actor.userId === id) throw ApiError.badRequest('You cannot delete your own account');

  const user = await User.findById(id).populate('role', 'name isSuperAdmin');
  if (!user) throw ApiError.notFound('User not found');

  if ((user.role as { isSuperAdmin?: boolean } | null)?.isSuperAdmin) {
    // Never leave the system without an owner.
    const superAdminRoles = await Role.find({ isSuperAdmin: true }).select('_id').lean();
    const remaining = await User.countDocuments({
      role: { $in: superAdminRoles.map((r) => r._id) },
      status: 'active',
      _id: { $ne: user._id },
    });
    if (remaining === 0) throw ApiError.badRequest('At least one active super admin must remain');
    if (!actor.isSuperAdmin) throw ApiError.forbidden('Only a super admin can delete a super admin account');
  }

  await user.deleteOne();

  await recordActivity(req, {
    action: 'users.delete',
    entity: 'User',
    entityId: id,
    description: `Deleted user ${user.name} (${user.email})`,
  });
}

/** The people directory behind the portal's Search / Directory dialog. */
export async function listDirectory(query: { search?: string; field?: 'name' | 'department' | 'country'; limit: number }) {
  const filter: Record<string, unknown> = { status: 'active', showInDirectory: true };
  if (query.search) {
    const needle = new RegExp(escapeRegex(query.search), 'i');
    filter[query.field ?? 'name'] = needle;
  }

  const items = await User.find(filter)
    .select('name department country jobTitle')
    .sort({ name: 1 })
    .limit(query.limit)
    .lean();

  // Email addresses stay out of the public directory payload on purpose.
  // Initials are derived here rather than read from the schema virtual: a lean
  // query returns plain objects and does not run virtuals.
  return items.map((u) => ({
    id: String(u._id),
    name: u.name,
    department: u.department ?? '',
    country: u.country ?? '',
    jobTitle: u.jobTitle ?? '',
    initials: initialsOf(u.name),
  }));
}

/**
 * Resolves a role id and refuses the two escalation paths: granting a
 * super-admin role, or granting permissions the actor does not hold.
 */
async function assertAssignableRole(req: Request, roleId: string) {
  const actor = req.auth;
  if (!actor) throw ApiError.unauthorized();

  const role = await Role.findById(roleId);
  if (!role) throw ApiError.badRequest('Role not found', { field: 'role' });

  if (role.isSuperAdmin && !actor.isSuperAdmin) {
    throw ApiError.forbidden('Only a super admin can assign the super admin role');
  }
  if (!actor.isSuperAdmin) {
    if (!actor.permissions.has(PERMISSIONS.ROLES_ASSIGN)) {
      throw ApiError.forbidden('You do not have permission to assign roles');
    }
    const beyond = (role.permissions ?? []).filter((p) => !actor.permissions.has(p));
    if (beyond.length > 0) {
      throw ApiError.forbidden('You cannot assign a role with permissions you do not hold', {
        details: { beyond },
      });
    }
  }
  return role;
}

/** "Eva Fernández" → "EF", for the portal avatars. */
function initialsOf(name: string): string {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
