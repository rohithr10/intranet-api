import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { User, verifyPassword } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { clearAuthCookies, setAuthCookies } from '../utils/cookies.js';
import { issueCsrfCookie } from '../middleware/csrf.js';
import { ALL_PERMISSIONS } from '../utils/permissions.js';
import type { AccessTokenClaims, AuthContext } from '../types/domain.js';
import { recordActivity } from './activityService.js';

interface RoleShape {
  _id: Types.ObjectId;
  name: string;
  key: string;
  permissions: string[];
  isSuperAdmin: boolean;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  department: string;
  country: string;
  jobTitle: string;
  status: string;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
  role: { id: string; name: string; key: string; isSuperAdmin: boolean };
  permissions: string[];
}

/**
 * Turns token claims into the live identity used for authorization.
 *
 * Everything that matters — account status, role, permission set — comes from
 * the database, so the token cannot carry stale privileges. `tokenVersion`
 * invalidates tokens issued before a password change or a deactivation.
 */
export async function loadAuthContext(claims: AccessTokenClaims): Promise<AuthContext> {
  const user = await User.findById(claims.sub)
    .select('name email status role tokenVersion')
    .populate<{ role: RoleShape }>('role', 'name key permissions isSuperAdmin')
    .lean();

  if (!user) throw ApiError.unauthorized('Account no longer exists', { code: 'ACCOUNT_MISSING' });
  if (user.status !== 'active') {
    throw ApiError.forbidden('This account is not active', { code: 'ACCOUNT_DISABLED' });
  }
  if ((user.tokenVersion ?? 0) !== claims.tokenVersion) {
    throw ApiError.unauthorized('Session is no longer valid, please sign in again', {
      code: 'TOKEN_REVOKED',
    });
  }
  if (!user.role) throw ApiError.forbidden('No role assigned to this account');

  const role = user.role;
  return {
    userId: String(user._id),
    email: user.email,
    name: user.name,
    roleId: String(role._id),
    roleKey: role.key,
    roleName: role.name,
    isSuperAdmin: Boolean(role.isSuperAdmin),
    permissions: new Set(role.isSuperAdmin ? ALL_PERMISSIONS : (role.permissions ?? [])),
  };
}

/** Verifies credentials and issues the session cookies. */
export async function login(
  req: Request,
  res: Response,
  email: string,
  password: string,
): Promise<SessionUser> {
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+passwordHash')
    .populate<{ role: RoleShape }>('role', 'name key permissions isSuperAdmin');

  // One message and one timing profile for "no such user" and "wrong password":
  // a different answer for each would let anyone enumerate valid accounts.
  const hash = user?.get('passwordHash') as string | undefined;
  const passwordMatches = hash
    ? await verifyPassword(password, hash)
    : await verifyPassword(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');

  if (!user || !passwordMatches) {
    await recordActivity(req, {
      action: 'auth.login.failed',
      entity: 'User',
      status: 'failure',
      actorEmail: email.toLowerCase(),
      description: `Failed sign-in attempt for ${email.toLowerCase()}`,
    });
    throw ApiError.unauthorized('Incorrect email or password', { code: 'INVALID_CREDENTIALS' });
  }

  if (user.status !== 'active') {
    await recordActivity(req, {
      action: 'auth.login.blocked',
      entity: 'User',
      entityId: String(user._id),
      status: 'failure',
      actorId: String(user._id),
      actorEmail: user.email,
      description: `Sign-in blocked for ${user.email} (status: ${user.status})`,
    });
    throw ApiError.forbidden('This account is not active. Contact an administrator.', {
      code: 'ACCOUNT_DISABLED',
    });
  }

  user.set('lastLoginAt', new Date());
  await user.save({ validateModifiedOnly: true });

  issueSession(res, {
    userId: String(user._id),
    email: user.email,
    roleKey: user.role?.key ?? '',
    tokenVersion: user.get('tokenVersion') ?? 0,
  });

  await recordActivity(req, {
    action: 'auth.login',
    entity: 'User',
    entityId: String(user._id),
    actorId: String(user._id),
    actorEmail: user.email,
    description: `${user.name} signed in`,
  });

  return toSessionUser(user, user.role);
}

/** Issues a fresh access token from a valid refresh cookie (sliding session). */
export async function refresh(res: Response, token: string): Promise<SessionUser> {
  const claims = verifyRefreshToken(token);
  const user = await User.findById(claims.sub).populate<{ role: RoleShape }>(
    'role',
    'name key permissions isSuperAdmin',
  );

  if (!user || user.status !== 'active') {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Session expired, please sign in again', { code: 'TOKEN_EXPIRED' });
  }
  if ((user.get('tokenVersion') ?? 0) !== claims.tokenVersion) {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Session is no longer valid, please sign in again', {
      code: 'TOKEN_REVOKED',
    });
  }

  issueSession(res, {
    userId: String(user._id),
    email: user.email,
    roleKey: user.role?.key ?? '',
    tokenVersion: user.get('tokenVersion') ?? 0,
  });

  return toSessionUser(user, user.role);
}

export async function logout(req: Request, res: Response): Promise<void> {
  clearAuthCookies(res);
  if (req.auth) {
    await recordActivity(req, {
      action: 'auth.logout',
      entity: 'User',
      entityId: req.auth.userId,
      description: `${req.auth.name} signed out`,
    });
  }
}

/** Current session as the frontend needs it, including the permission list. */
export async function currentUser(auth: AuthContext): Promise<SessionUser> {
  const user = await User.findById(auth.userId).populate<{ role: RoleShape }>(
    'role',
    'name key permissions isSuperAdmin',
  );
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  return toSessionUser(user, user.role);
}

/** Lets a signed-in user replace their own password; revokes other sessions. */
export async function changeOwnPassword(
  req: Request,
  res: Response,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const auth = req.auth;
  if (!auth) throw ApiError.unauthorized();

  const user = await User.findById(auth.userId).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  const hash = user.get('passwordHash') as string;
  if (!(await verifyPassword(currentPassword, hash))) {
    throw ApiError.badRequest('Your current password is incorrect', { field: 'currentPassword' });
  }

  const { hashPassword } = await import('../models/User.js');
  user.set('passwordHash', await hashPassword(newPassword));
  user.set('mustChangePassword', false);
  user.set('tokenVersion', (user.get('tokenVersion') ?? 0) + 1);
  await user.save({ validateModifiedOnly: true });

  // The caller's own tokens were just invalidated along with everyone else's,
  // so hand them a new pair rather than logging them out mid-session.
  issueSession(res, {
    userId: String(user._id),
    email: user.email,
    roleKey: auth.roleKey,
    tokenVersion: user.get('tokenVersion') ?? 0,
  });

  await recordActivity(req, {
    action: 'auth.password.change',
    entity: 'User',
    entityId: String(user._id),
    description: `${user.name} changed their password`,
  });
}

function issueSession(
  res: Response,
  claims: { userId: string; email: string; roleKey: string; tokenVersion: number },
): void {
  const accessToken = signAccessToken({
    sub: claims.userId,
    email: claims.email,
    roleKey: claims.roleKey,
    tokenVersion: claims.tokenVersion,
  });
  const refreshToken = signRefreshToken({ sub: claims.userId, tokenVersion: claims.tokenVersion });
  setAuthCookies(res, accessToken, refreshToken);
  issueCsrfCookie(res);
}

function toSessionUser(
  user: { _id: unknown; name: string; email: string; department?: string; country?: string; jobTitle?: string; status: string; lastLoginAt?: Date | null; mustChangePassword?: boolean },
  role: RoleShape | null | undefined,
): SessionUser {
  const isSuperAdmin = Boolean(role?.isSuperAdmin);
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    department: user.department ?? '',
    country: user.country ?? '',
    jobTitle: user.jobTitle ?? '',
    status: user.status,
    lastLoginAt: user.lastLoginAt ?? null,
    mustChangePassword: Boolean(user.mustChangePassword),
    role: {
      id: String(role?._id ?? ''),
      name: role?.name ?? '',
      key: role?.key ?? '',
      isSuperAdmin,
    },
    permissions: isSuperAdmin ? [...ALL_PERMISSIONS] : (role?.permissions ?? []),
  };
}

export { ALL_PERMISSIONS };
