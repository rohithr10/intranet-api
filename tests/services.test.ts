import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
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
  type Session,
} from './helpers.js';

describe('service management', () => {
  let app: Express;
  let session: Session;

  beforeAll(async () => {
    app = await setupTestApp();
  });
  afterAll(teardownTestApp);

  beforeEach(async () => {
    await resetDatabase();
    await createUser({ email: 'super@test.local', roleKey: 'super-admin' });
    session = await signIn(app, 'super@test.local');
  });

  it('creates a service, derives its key and shows it in the portal', async () => {
    const created = await post(session, '/api/services', {
      name: 'Cyber Academy',
      description: 'Security awareness training.',
      icon: 'GraduationCap',
      tab: 'GENERAL',
      category: 'Learning',
    }).expect(201);

    expect(created.body.data.service.key).toBe('cyber-academy');
    expect(created.body.data.service.status).toBe('enabled');

    const portal = await request(app).get('/api/public/services').expect(200);
    expect(portal.body.data.services.map((s: { name: string }) => s.name)).toContain('Cyber Academy');
    expect(portal.body.data.tabs).toContain('GENERAL');
  });

  it('rejects a duplicate service key', async () => {
    await post(session, '/api/services', { name: 'Portal DATA' }).expect(201);
    const second = await post(session, '/api/services', { name: 'Portal DATA' });
    expect(second.status).toBe(409);
    expect(second.body.field).toBe('key');
  });

  it('edits a service and the portal reflects the change', async () => {
    const created = await post(session, '/api/services', { name: 'Ethics Box' }).expect(201);
    const id = created.body.data.service._id as string;

    await put(session, `/api/services/${id}`, {
      name: 'Ethics Channel',
      description: 'Confidential reporting.',
    }).expect(200);

    const portal = await request(app).get('/api/public/services').expect(200);
    const names = portal.body.data.services.map((s: { name: string }) => s.name);
    expect(names).toContain('Ethics Channel');
    expect(names).not.toContain('Ethics Box');
  });

  it('removes a disabled service from the portal and brings it back when enabled', async () => {
    const created = await post(session, '/api/services', { name: 'Reserva de Recursos' }).expect(201);
    const id = created.body.data.service._id as string;

    await patch(session, `/api/services/${id}/status`, { status: 'disabled' }).expect(200);

    let portal = await request(app).get('/api/public/services').expect(200);
    expect(portal.body.data.services.map((s: { name: string }) => s.name)).not.toContain('Reserva de Recursos');

    // The admin list still shows it, so it can be switched back on.
    const admin = await session.agent.get('/api/services').expect(200);
    expect(admin.body.data.items.map((s: { name: string }) => s.name)).toContain('Reserva de Recursos');

    await patch(session, `/api/services/${id}/status`, { status: 'enabled' }).expect(200);
    portal = await request(app).get('/api/public/services').expect(200);
    expect(portal.body.data.services.map((s: { name: string }) => s.name)).toContain('Reserva de Recursos');
  });

  it('hides an authenticated-only service from anonymous visitors', async () => {
    await post(session, '/api/services', { name: 'Employee self-service', visibility: 'authenticated' }).expect(201);

    const anonymous = await request(app).get('/api/public/services').expect(200);
    expect(anonymous.body.data.services.map((s: { name: string }) => s.name)).not.toContain('Employee self-service');

    const signedIn = await session.agent.get('/api/public/services').expect(200);
    expect(signedIn.body.data.services.map((s: { name: string }) => s.name)).toContain('Employee self-service');
  });

  it('shows a restricted service only to the roles assigned to it', async () => {
    const adminRole = await roleId('admin');
    await post(session, '/api/services', {
      name: 'Board papers',
      visibility: 'restricted',
      roles: [adminRole],
    }).expect(201);

    await createUser({ email: 'admin@test.local', roleKey: 'admin' });
    await createUser({ email: 'viewer@test.local', roleKey: 'viewer' });

    const admin = await signIn(app, 'admin@test.local');
    const viewer = await signIn(app, 'viewer@test.local');

    const adminView = await admin.agent.get('/api/public/services').expect(200);
    const viewerView = await viewer.agent.get('/api/public/services').expect(200);

    expect(adminView.body.data.services.map((s: { name: string }) => s.name)).toContain('Board papers');
    expect(viewerView.body.data.services.map((s: { name: string }) => s.name)).not.toContain('Board papers');
  });

  it('never exposes role assignments or config through the public API', async () => {
    await post(session, '/api/services', {
      name: 'Internal tool',
      config: { internalEndpoint: 'https://internal.example/secret-path' },
    }).expect(201);

    const portal = await request(app).get('/api/public/services').expect(200);
    const body = JSON.stringify(portal.body);
    expect(body).not.toContain('internalEndpoint');
    expect(body).not.toContain('secret-path');
    expect(body).not.toContain('roles');
  });

  it('deletes a service', async () => {
    const created = await post(session, '/api/services', { name: 'Temporary service' }).expect(201);
    await del(session, `/api/services/${created.body.data.service._id as string}`).expect(200);
    const portal = await request(app).get('/api/public/services').expect(200);
    expect(portal.body.data.services).toHaveLength(0);
  });

  it('refuses to delete a service that application options point at', async () => {
    const created = await post(session, '/api/services', { name: 'Configured service' }).expect(201);
    const id = created.body.data.service._id as string;

    await post(session, '/api/options', {
      name: 'Row limit',
      key: 'configured.row_limit',
      type: 'number',
      defaultValue: 10,
      service: id,
    }).expect(201);

    const response = await del(session, `/api/services/${id}`);
    expect(response.status).toBe(409);
  });
});

describe('application options', () => {
  let app: Express;
  let session: Session;

  beforeAll(async () => {
    app = await setupTestApp();
  });
  afterAll(teardownTestApp);

  beforeEach(async () => {
    await resetDatabase();
    await createUser({ email: 'super@test.local', roleKey: 'super-admin' });
    session = await signIn(app, 'super@test.local');
  });

  it('creates an option and serves it to the portal when public', async () => {
    await post(session, '/api/options', {
      name: 'Hero headline',
      key: 'portal.hero_title',
      type: 'text',
      defaultValue: 'A world of possibilities.',
      isPublic: true,
    }).expect(201);

    const portal = await request(app).get('/api/public/options').expect(200);
    expect(portal.body.data.options['portal.hero_title']).toBe('A world of possibilities.');
  });

  it('keeps a non-public option out of the anonymous payload', async () => {
    await post(session, '/api/options', {
      name: 'Internal threshold',
      key: 'internal.threshold',
      type: 'number',
      defaultValue: 42,
      isPublic: false,
    }).expect(201);

    const anonymous = await request(app).get('/api/public/options').expect(200);
    expect(anonymous.body.data.options['internal.threshold']).toBeUndefined();

    const signedIn = await session.agent.get('/api/public/options').expect(200);
    expect(signedIn.body.data.options['internal.threshold']).toBe(42);
  });

  it('changes a value and the portal sees the new one', async () => {
    const created = await post(session, '/api/options', {
      name: 'News per page',
      key: 'portal.news_page_size',
      type: 'number',
      defaultValue: 4,
      isPublic: true,
      validation: { min: 1, max: 24 },
    }).expect(201);

    await patch(session, `/api/options/${created.body.data.option._id as string}/value`, { value: 8 }).expect(200);

    const portal = await request(app).get('/api/public/options').expect(200);
    expect(portal.body.data.options['portal.news_page_size']).toBe(8);
  });

  it('enforces the option type and its validation rules', async () => {
    const created = await post(session, '/api/options', {
      name: 'News per page',
      key: 'portal.news_page_size',
      type: 'number',
      defaultValue: 4,
      validation: { min: 1, max: 24 },
    }).expect(201);
    const id = created.body.data.option._id as string;

    expect((await patch(session, `/api/options/${id}/value`, { value: 'eight' })).status).toBe(422);
    expect((await patch(session, `/api/options/${id}/value`, { value: 99 })).status).toBe(422);
    expect((await patch(session, `/api/options/${id}/value`, { value: 0 })).status).toBe(422);
    await patch(session, `/api/options/${id}/value`, { value: 6 }).expect(200);
  });

  it('restricts a select option to its listed choices', async () => {
    const created = await post(session, '/api/options', {
      name: 'Default theme',
      key: 'portal.default_theme',
      type: 'select',
      defaultValue: 'system',
      choices: [
        { label: 'Follow device', value: 'system' },
        { label: 'Light', value: 'light' },
      ],
    }).expect(201);
    const id = created.body.data.option._id as string;

    expect((await patch(session, `/api/options/${id}/value`, { value: 'neon' })).status).toBe(422);
    await patch(session, `/api/options/${id}/value`, { value: 'light' }).expect(200);
  });

  it('refuses option keys that look like credentials', async () => {
    for (const key of ['smtp.password', 'stripe.api_key', 'db.connection_string', 'service.secret']) {
      const response = await post(session, '/api/options', {
        name: 'Should not exist',
        key,
        type: 'text',
        defaultValue: 'nope',
      });
      expect(response.status, key).toBe(400);
      expect(response.body.code).toBe('SENSITIVE_KEY');
    }
  });
});
