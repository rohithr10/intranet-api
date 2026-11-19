import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { Role } from '../src/models/Role.js';
import { User } from '../src/models/User.js';
import {
  createUser,
  del,
  patch,
  post,
  put,
  resetDatabase,
  roleId,
  setupTestApp,
  signIn,
  teardownTestApp,
} from './helpers.js';

describe('role-based access control', () => {
  let app: Express;

  beforeAll(async () => {
    app = await setupTestApp();
  });
  afterAll(teardownTestApp);

  beforeEach(async () => {
    await resetDatabase();
    await Promise.all([
      createUser({ email: 'super@test.local', roleKey: 'super-admin', name: 'Super Admin' }),
      createUser({ email: 'admin@test.local', roleKey: 'admin', name: 'Admin User' }),
      createUser({ email: 'manager@test.local', roleKey: 'content-manager', name: 'Content Manager' }),
      createUser({ email: 'editor@test.local', roleKey: 'editor', name: 'Editor User' }),
      createUser({ email: 'viewer@test.local', roleKey: 'viewer', name: 'Viewer User' }),
    ]);
  });

  it('gives the super admin every permission and access to every module', async () => {
    const session = await signIn(app, 'super@test.local');
    expect(session.user.role).toMatchObject({ isSuperAdmin: true });

    for (const path of ['/api/users', '/api/roles', '/api/permissions', '/api/services', '/api/options', '/api/content', '/api/news', '/api/tags', '/api/media', '/api/dashboard/stats', '/api/dashboard/activity']) {
      await session.agent.get(path).expect(200);
    }
  });

  it('lets an admin read users but not create or delete them', async () => {
    const session = await signIn(app, 'admin@test.local');
    await session.agent.get('/api/users').expect(200);

    const created = await post(session, '/api/users', {
      name: 'New Person',
      email: 'new@test.local',
      password: 'SomePassword123',
      role: await roleId('viewer'),
    });
    expect(created.status).toBe(403);

    const target = await User.findOne({ email: 'viewer@test.local' }).lean();
    const deleted = await del(session, `/api/users/${String(target?._id)}`);
    expect(deleted.status).toBe(403);
  });

  it('refuses a content manager access to user and role management', async () => {
    const session = await signIn(app, 'manager@test.local');
    await session.agent.get('/api/users').expect(403);
    await session.agent.get('/api/roles').expect(403);
    // But its own modules work.
    await session.agent.get('/api/news').expect(200);
    await session.agent.get('/api/content').expect(200);
    await session.agent.get('/api/tags').expect(200);
  });

  it('lets an editor edit news but not create, publish or delete it', async () => {
    const author = await signIn(app, 'manager@test.local');
    const article = await post(author, '/api/news', { title: 'Editor target article' }).expect(201);
    const id = article.body.data.news._id as string;

    const session = await signIn(app, 'editor@test.local');

    await put(session, `/api/news/${id}`, { summary: 'Edited by the editor' }).expect(200);

    const created = await post(session, '/api/news', { title: 'Editor tries to create' });
    expect(created.status).toBe(403);

    const published = await patch(session, `/api/news/${id}/publish`, { action: 'publish' });
    expect(published.status).toBe(403);

    const removed = await del(session, `/api/news/${id}`);
    expect(removed.status).toBe(403);
  });

  it('stops an editor from publishing through the update endpoint as well', async () => {
    const author = await signIn(app, 'manager@test.local');
    const article = await post(author, '/api/news', { title: 'Back door publish attempt' }).expect(201);
    const id = article.body.data.news._id as string;

    const session = await signIn(app, 'editor@test.local');
    const response = await put(session, `/api/news/${id}`, { status: 'published' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PUBLISH_FORBIDDEN');
  });

  it('gives a viewer read-only access', async () => {
    const session = await signIn(app, 'viewer@test.local');

    await session.agent.get('/api/news').expect(200);
    await session.agent.get('/api/content').expect(200);
    await session.agent.get('/api/services').expect(200);

    expect((await post(session, '/api/news', { title: 'Viewer article' })).status).toBe(403);
    expect((await post(session, '/api/content', { title: 'Viewer doc', category: 'Misc' })).status).toBe(403);
    expect((await post(session, '/api/services', { name: 'Viewer service' })).status).toBe(403);
    expect((await post(session, '/api/tags', { name: 'Viewer tag' })).status).toBe(403);
    await session.agent.get('/api/users').expect(403);
    await session.agent.get('/api/dashboard/activity').expect(403);
  });

  it('answers 401 when unauthenticated and 403 when authenticated but unauthorised', async () => {
    await request(app).get('/api/users').expect(401);
    const viewer = await signIn(app, 'viewer@test.local');
    await viewer.agent.get('/api/users').expect(403);
  });

  describe('privilege escalation', () => {
    it('stops a user from changing their own role', async () => {
      const session = await signIn(app, 'super@test.local');
      const self = await User.findOne({ email: 'super@test.local' }).lean();
      const response = await put(session, `/api/users/${String(self?._id)}`, { role: await roleId('viewer') });

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/cannot change your own role/i);
    });

    it('stops a user from changing their own status', async () => {
      const session = await signIn(app, 'super@test.local');
      const self = await User.findOne({ email: 'super@test.local' }).lean();
      const response = await put(session, `/api/users/${String(self?._id)}`, { status: 'inactive' });
      expect(response.status).toBe(403);
    });

    it('stops a non-super-admin from granting permissions it does not hold', async () => {
      // Give the admin role the ability to create roles, but not users.delete.
      await Role.updateOne({ key: 'admin' }, { $addToSet: { permissions: 'roles.create' } });
      const session = await signIn(app, 'admin@test.local');

      const response = await post(session, '/api/roles', {
        name: 'Sneaky role',
        permissions: ['users.delete', 'settings.manage'],
      });

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/cannot grant permissions you do not hold/i);
    });

    it('stops a non-super-admin from assigning the super admin role', async () => {
      await Role.updateOne({ key: 'admin' }, { $addToSet: { permissions: { $each: ['users.create', 'roles.assign'] } } });
      const session = await signIn(app, 'admin@test.local');

      const response = await post(session, '/api/users', {
        name: 'Escalated',
        email: 'escalated@test.local',
        password: 'SomePassword123',
        role: await roleId('super-admin'),
      });

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/only a super admin/i);
    });

    it('stops a non-super-admin from editing a super admin account', async () => {
      await Role.updateOne({ key: 'admin' }, { $addToSet: { permissions: 'users.edit' } });
      const session = await signIn(app, 'admin@test.local');
      const target = await User.findOne({ email: 'super@test.local' }).lean();

      const response = await put(session, `/api/users/${String(target?._id)}`, { name: 'Renamed' });
      expect(response.status).toBe(403);
    });

    it('refuses to delete the last active super admin', async () => {
      const session = await signIn(app, 'super@test.local');
      const other = await createUser({ email: 'second-super@test.local', roleKey: 'super-admin' });

      // Deleting one of two is fine…
      await del(session, `/api/users/${other.id}`).expect(200);

      // …but an account cannot delete itself, which is what would be needed to
      // remove the last one.
      const self = await User.findOne({ email: 'super@test.local' }).lean();
      const response = await del(session, `/api/users/${String(self?._id)}`);
      expect(response.status).toBe(400);
    });

    it('rejects an unknown permission key', async () => {
      const session = await signIn(app, 'super@test.local');
      const response = await post(session, '/api/roles', {
        name: 'Invented role',
        permissions: ['everything.always'],
      });
      expect(response.status).toBe(422);
    });
  });

  describe('custom roles', () => {
    it('lets a super admin create a custom role and assign it to a user', async () => {
      const session = await signIn(app, 'super@test.local');

      const created = await post(session, '/api/roles', {
        name: 'News Publisher',
        description: 'May publish news only.',
        permissions: ['dashboard.view', 'news.view', 'news.edit', 'news.publish'],
      }).expect(201);

      const roleIdValue = created.body.data.role._id as string;
      expect(created.body.data.role.key).toBe('news-publisher');

      const user = await User.findOne({ email: 'viewer@test.local' }).lean();
      await patch(session, `/api/users/${String(user?._id)}/role`, { role: roleIdValue }).expect(200);

      const asUser = await signIn(app, 'viewer@test.local');
      expect(asUser.user.permissions).toEqual(
        expect.arrayContaining(['news.publish', 'news.edit', 'news.view']),
      );
      await asUser.agent.get('/api/news').expect(200);
      await asUser.agent.get('/api/users').expect(403);
    });

    it('applies a permission change to existing sessions on the next request', async () => {
      const superSession = await signIn(app, 'super@test.local');
      const viewer = await signIn(app, 'viewer@test.local');
      await viewer.agent.get('/api/news').expect(200);

      const role = await Role.findOne({ key: 'viewer' }).lean();
      await put(superSession, `/api/roles/${String(role?._id)}`, { permissions: ['dashboard.view'] }).expect(200);

      // The old access token is now stale, so the request is rejected and the
      // client re-authenticates rather than keeping the old permissions.
      const response = await viewer.agent.get('/api/news');
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_REVOKED');

      const refreshed = await signIn(app, 'viewer@test.local');
      await refreshed.agent.get('/api/news').expect(403);
    });

    it('refuses to delete a system role or one still in use', async () => {
      const session = await signIn(app, 'super@test.local');
      const viewerRole = await Role.findOne({ key: 'viewer' }).lean();
      const response = await del(session, `/api/roles/${String(viewerRole?._id)}`);
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/system roles/i);
    });
  });
});
