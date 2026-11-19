import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  createUser,
  patch,
  post,
  resetDatabase,
  setupTestApp,
  signIn,
  teardownTestApp,
  type Session,
} from './helpers.js';

describe('dashboard and directory', () => {
  let app: Express;
  let session: Session;

  beforeAll(async () => {
    app = await setupTestApp();
  });
  afterAll(teardownTestApp);

  beforeEach(async () => {
    await resetDatabase();
    await createUser({ email: 'super@test.local', roleKey: 'super-admin', name: 'Super Admin' });
    session = await signIn(app, 'super@test.local');
  });

  it('counts real documents rather than returning fixed numbers', async () => {
    await createUser({ email: 'viewer@test.local', roleKey: 'viewer', name: 'Viewer One' });
    await createUser({ email: 'off@test.local', roleKey: 'viewer', name: 'Dormant', status: 'inactive' });

    await post(session, '/api/services', { name: 'Enabled service' }).expect(201);
    const disabled = await post(session, '/api/services', { name: 'Disabled service' }).expect(201);
    await patch(session, `/api/services/${disabled.body.data.service._id as string}/status`, {
      status: 'disabled',
    }).expect(200);

    const article = await post(session, '/api/news', { title: 'Published story' }).expect(201);
    await patch(session, `/api/news/${article.body.data.news._id as string}/publish`, { action: 'publish' }).expect(200);
    await post(session, '/api/news', { title: 'Draft story' }).expect(201);

    await post(session, '/api/content', { title: 'A document', category: 'Records' }).expect(201);

    const response = await session.agent.get('/api/dashboard/stats').expect(200);
    const { stats, recentContent, recentActivity } = response.body.data;

    expect(stats.users).toMatchObject({ total: 3, active: 2, inactive: 1 });
    expect(stats.services).toMatchObject({ total: 2, enabled: 1, disabled: 1 });
    expect(stats.news).toMatchObject({ published: 1, draft: 1, scheduled: 0 });
    expect(stats.content).toMatchObject({ draft: 1 });
    expect(stats.system.roles).toBe(5);

    expect(recentContent.length).toBeGreaterThan(0);
    expect(recentActivity.length).toBeGreaterThan(0);
    // The feed is newest-first.
    const timestamps = recentActivity.map((entry: { createdAt: string }) => new Date(entry.createdAt).getTime());
    expect([...timestamps].sort((a: number, b: number) => b - a)).toEqual(timestamps);
  });

  it('writes an audit entry for each administrative action', async () => {
    const service = await post(session, '/api/services', { name: 'Audited service' }).expect(201);
    await patch(session, `/api/services/${service.body.data.service._id as string}/status`, {
      status: 'disabled',
    }).expect(200);

    const log = await session.agent.get('/api/dashboard/activity').expect(200);
    const actions = log.body.data.items.map((entry: { action: string }) => entry.action);

    expect(actions).toEqual(expect.arrayContaining(['auth.login', 'services.create', 'services.toggle']));
    const toggle = log.body.data.items.find((entry: { action: string }) => entry.action === 'services.toggle');
    expect(toggle.actor.name).toBe('Super Admin');
    expect(toggle.description).toMatch(/disabled service/i);
  });

  it('serves the people directory to the portal without email addresses', async () => {
    await createUser({ email: 'eva@test.local', roleKey: 'viewer', name: 'Eva Fernández' });

    const response = await request(app).get('/api/public/directory').expect(200);
    const people = response.body.data.people as { name: string; initials: string }[];

    expect(people.map((person) => person.name)).toContain('Eva Fernández');
    expect(people.find((person) => person.name === 'Eva Fernández')?.initials).toBe('EF');
    expect(JSON.stringify(response.body)).not.toContain('@test.local');
  });

  it('searches the directory by the requested field', async () => {
    await createUser({ email: 'a@test.local', roleKey: 'viewer', name: 'Alex Morgan' });
    await createUser({ email: 'b@test.local', roleKey: 'viewer', name: 'Priya Sharma' });

    const { User } = await import('../src/models/User.js');
    await User.updateOne({ email: 'a@test.local' }, { department: 'Human Resources', country: 'Norway' });
    await User.updateOne({ email: 'b@test.local' }, { department: 'Sustainability', country: 'India' });

    const byName = await request(app).get('/api/public/directory?search=priya&field=name').expect(200);
    expect(byName.body.data.people).toHaveLength(1);

    const byDepartment = await request(app).get('/api/public/directory?field=department&search=human').expect(200);
    expect(byDepartment.body.data.people[0].name).toBe('Alex Morgan');

    const byCountry = await request(app).get('/api/public/directory?field=country&search=india').expect(200);
    expect(byCountry.body.data.people[0].name).toBe('Priya Sharma');
  });

  it('leaves accounts marked hidden out of the directory', async () => {
    const hidden = await createUser({ email: 'hidden@test.local', roleKey: 'viewer', name: 'Hidden Person' });
    const { User } = await import('../src/models/User.js');
    await User.updateOne({ _id: hidden.id }, { showInDirectory: false });

    const response = await request(app).get('/api/public/directory').expect(200);
    expect(response.body.data.people.map((p: { name: string }) => p.name)).not.toContain('Hidden Person');
  });

  it('keeps the health endpoint open and unauthenticated', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.data.status).toBe('ok');
  });
});
