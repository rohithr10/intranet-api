import { PERMISSIONS, type PermissionKey } from '../utils/permissions.js';

const P = PERMISSIONS;

export interface SeedRole {
  name: string;
  key: string;
  description: string;
  isSuperAdmin: boolean;
  permissions: PermissionKey[];
}

/**
 * The five roles the product ships with. They are marked `isSystem`, so they
 * cannot be deleted, but a super admin can still adjust the permissions of
 * everything except the super admin role itself (which always holds all).
 */
export const SEED_ROLES: SeedRole[] = [
  {
    name: 'Super Admin',
    key: 'super-admin',
    description: 'Unrestricted access to every module and setting.',
    isSuperAdmin: true,
    permissions: [],
  },
  {
    name: 'Admin',
    key: 'admin',
    description: 'Administers services, options, content and news. User management is granted explicitly.',
    isSuperAdmin: false,
    permissions: [
      P.DASHBOARD_VIEW,
      P.USERS_VIEW,
      P.ROLES_VIEW,
      P.PERMISSIONS_VIEW,
      P.SERVICES_VIEW, P.SERVICES_CREATE, P.SERVICES_EDIT, P.SERVICES_TOGGLE,
      P.OPTIONS_VIEW, P.OPTIONS_CREATE, P.OPTIONS_EDIT,
      P.CONTENT_VIEW, P.CONTENT_CREATE, P.CONTENT_EDIT, P.CONTENT_PUBLISH,
      P.NEWS_VIEW, P.NEWS_CREATE, P.NEWS_EDIT, P.NEWS_PUBLISH, P.NEWS_TAGS_MANAGE,
      P.MEDIA_VIEW, P.MEDIA_UPLOAD,
      P.AUDIT_VIEW,
    ],
  },
  {
    name: 'Content Manager',
    key: 'content-manager',
    description: 'Creates and publishes content and news, and manages tags and media.',
    isSuperAdmin: false,
    permissions: [
      P.DASHBOARD_VIEW,
      P.CONTENT_VIEW, P.CONTENT_CREATE, P.CONTENT_EDIT, P.CONTENT_PUBLISH,
      P.NEWS_VIEW, P.NEWS_CREATE, P.NEWS_EDIT, P.NEWS_PUBLISH, P.NEWS_TAGS_MANAGE,
      P.MEDIA_VIEW, P.MEDIA_UPLOAD,
      P.SERVICES_VIEW,
    ],
  },
  {
    name: 'Editor',
    key: 'editor',
    // No publish permission: the publishing guard in `publishing.ts` is what
    // actually stops an editor from making something live.
    description: 'Edits content and news but cannot publish without additional permission.',
    isSuperAdmin: false,
    permissions: [
      P.DASHBOARD_VIEW,
      P.CONTENT_VIEW, P.CONTENT_EDIT,
      P.NEWS_VIEW, P.NEWS_EDIT, P.NEWS_TAGS_MANAGE,
      P.MEDIA_VIEW, P.MEDIA_UPLOAD,
    ],
  },
  {
    name: 'Viewer',
    key: 'viewer',
    description: 'Read-only access to the modules they are permitted to see.',
    isSuperAdmin: false,
    permissions: [P.DASHBOARD_VIEW, P.CONTENT_VIEW, P.NEWS_VIEW, P.SERVICES_VIEW, P.MEDIA_VIEW],
  },
];
