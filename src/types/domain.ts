import type { Types } from 'mongoose';

export type Id = Types.ObjectId;

export const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PUBLISH_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

export const SERVICE_STATUSES = ['enabled', 'disabled'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_VISIBILITIES = ['public', 'authenticated', 'restricted'] as const;
export type ServiceVisibility = (typeof SERVICE_VISIBILITIES)[number];

export const OPTION_TYPES = ['boolean', 'text', 'number', 'select', 'multiselect', 'json'] as const;
export type OptionType = (typeof OPTION_TYPES)[number];

export const NEWS_SCOPES = ['Global', 'Local'] as const;
export type NewsScope = (typeof NEWS_SCOPES)[number];

export const ACTIVE_STATUSES = ['active', 'inactive'] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

/** Claims carried by the access token. Roles are never trusted from here for
 *  authorization decisions — permissions are re-read from the database. */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  roleKey: string;
  tokenVersion: number;
  type: 'access';
}

export interface RefreshTokenClaims {
  sub: string;
  tokenVersion: number;
  type: 'refresh';
}

/** Resolved request identity: the account plus its effective permission set. */
export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  isSuperAdmin: boolean;
  permissions: Set<string>;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
