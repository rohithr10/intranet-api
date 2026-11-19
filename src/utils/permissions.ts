/**
 * The single source of truth for permission keys.
 *
 * Routes reference these constants, the seed writes them to the Permission
 * collection, and the admin UI renders them grouped. Adding a permission here
 * and re-running the seed is the whole workflow.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',

  ROLES_VIEW: 'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_EDIT: 'roles.edit',
  ROLES_DELETE: 'roles.delete',
  ROLES_ASSIGN: 'roles.assign',

  PERMISSIONS_VIEW: 'permissions.view',

  SERVICES_VIEW: 'services.view',
  SERVICES_CREATE: 'services.create',
  SERVICES_EDIT: 'services.edit',
  SERVICES_DELETE: 'services.delete',
  SERVICES_TOGGLE: 'services.toggle',

  OPTIONS_VIEW: 'options.view',
  OPTIONS_CREATE: 'options.create',
  OPTIONS_EDIT: 'options.edit',
  OPTIONS_DELETE: 'options.delete',

  CONTENT_VIEW: 'content.view',
  CONTENT_CREATE: 'content.create',
  CONTENT_EDIT: 'content.edit',
  CONTENT_PUBLISH: 'content.publish',
  CONTENT_DELETE: 'content.delete',

  NEWS_VIEW: 'news.view',
  NEWS_CREATE: 'news.create',
  NEWS_EDIT: 'news.edit',
  NEWS_PUBLISH: 'news.publish',
  NEWS_DELETE: 'news.delete',
  NEWS_TAGS_MANAGE: 'news.tags.manage',

  MEDIA_VIEW: 'media.view',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',

  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

/** Groups and human labels used by the seed and the Permission Management UI. */
export const PERMISSION_CATALOG: ReadonlyArray<{
  key: PermissionKey;
  group: string;
  description: string;
}> = [
  { key: PERMISSIONS.DASHBOARD_VIEW, group: 'Dashboard', description: 'View the admin dashboard and its statistics' },

  { key: PERMISSIONS.USERS_VIEW, group: 'Users', description: 'List and view user accounts' },
  { key: PERMISSIONS.USERS_CREATE, group: 'Users', description: 'Create user accounts' },
  { key: PERMISSIONS.USERS_EDIT, group: 'Users', description: 'Edit user details and status' },
  { key: PERMISSIONS.USERS_DELETE, group: 'Users', description: 'Delete user accounts' },

  { key: PERMISSIONS.ROLES_VIEW, group: 'Roles', description: 'List and view roles' },
  { key: PERMISSIONS.ROLES_CREATE, group: 'Roles', description: 'Create custom roles' },
  { key: PERMISSIONS.ROLES_EDIT, group: 'Roles', description: 'Edit role details' },
  { key: PERMISSIONS.ROLES_DELETE, group: 'Roles', description: 'Delete custom roles' },
  { key: PERMISSIONS.ROLES_ASSIGN, group: 'Roles', description: 'Assign permissions to roles and roles to users' },

  { key: PERMISSIONS.PERMISSIONS_VIEW, group: 'Permissions', description: 'View the permission catalog' },

  { key: PERMISSIONS.SERVICES_VIEW, group: 'Services', description: 'List and view services' },
  { key: PERMISSIONS.SERVICES_CREATE, group: 'Services', description: 'Create services' },
  { key: PERMISSIONS.SERVICES_EDIT, group: 'Services', description: 'Edit service details' },
  { key: PERMISSIONS.SERVICES_DELETE, group: 'Services', description: 'Delete services' },
  { key: PERMISSIONS.SERVICES_TOGGLE, group: 'Services', description: 'Enable or disable services' },

  { key: PERMISSIONS.OPTIONS_VIEW, group: 'Application options', description: 'View application options' },
  { key: PERMISSIONS.OPTIONS_CREATE, group: 'Application options', description: 'Create application options' },
  { key: PERMISSIONS.OPTIONS_EDIT, group: 'Application options', description: 'Change application option values' },
  { key: PERMISSIONS.OPTIONS_DELETE, group: 'Application options', description: 'Delete application options' },

  { key: PERMISSIONS.CONTENT_VIEW, group: 'Content', description: 'View all content including drafts' },
  { key: PERMISSIONS.CONTENT_CREATE, group: 'Content', description: 'Create content' },
  { key: PERMISSIONS.CONTENT_EDIT, group: 'Content', description: 'Edit content' },
  { key: PERMISSIONS.CONTENT_PUBLISH, group: 'Content', description: 'Publish, schedule, unpublish or archive content' },
  { key: PERMISSIONS.CONTENT_DELETE, group: 'Content', description: 'Delete content' },

  { key: PERMISSIONS.NEWS_VIEW, group: 'News', description: 'View all news including drafts' },
  { key: PERMISSIONS.NEWS_CREATE, group: 'News', description: 'Create news articles' },
  { key: PERMISSIONS.NEWS_EDIT, group: 'News', description: 'Edit news articles' },
  { key: PERMISSIONS.NEWS_PUBLISH, group: 'News', description: 'Publish, schedule, unpublish or archive news' },
  { key: PERMISSIONS.NEWS_DELETE, group: 'News', description: 'Delete news articles' },
  { key: PERMISSIONS.NEWS_TAGS_MANAGE, group: 'News', description: 'Create, edit and delete news tags' },

  { key: PERMISSIONS.MEDIA_VIEW, group: 'Media', description: 'Browse the media library' },
  { key: PERMISSIONS.MEDIA_UPLOAD, group: 'Media', description: 'Upload media files' },
  { key: PERMISSIONS.MEDIA_DELETE, group: 'Media', description: 'Delete unused media files' },

  { key: PERMISSIONS.AUDIT_VIEW, group: 'System', description: 'View activity logs' },
  { key: PERMISSIONS.SETTINGS_MANAGE, group: 'System', description: 'Manage system settings' },
];
