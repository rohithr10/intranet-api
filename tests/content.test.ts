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
  setupTestApp,
  signIn,
  teardownTestApp,
  type Session,
} from './helpers.js';

describe('content management', () => {
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

  async function createDraft(overrides: Record<string, unknown> = {}) {
    const response = await post(session, '/api/content', {
      title: 'Code of Conduct — Overview',
      summary: 'How we work.',
      body: '<p>The overview.</p>',
      category: 'Code of Conduct',
      country: 'URBASER GROUP',
      ...overrides,
    }).expect(201);
    return response.body.data.content as { _id: string; slug: string; status: string };
  }

  it('saves a draft that is invisible to visitors', async () => {
    const draft = await createDraft();
    expect(draft.status).toBe('draft');
    expect(draft.slug).toBe('code-of-conduct-overview');

    const documents = await request(app).get('/api/public/documents').expect(200);
    expect(documents.body.data.folders).toHaveLength(0);

    // Nor by its slug.
    await request(app).get(`/api/public/content/${draft.slug}`).expect(404);
  });

  it('publishes content and it appears in the portal Documents section', async () => {
    const draft = await createDraft();
    await patch(session, `/api/content/${draft._id}/publish`, { action: 'publish' }).expect(200);

    const documents = await request(app).get('/api/public/documents?country=URBASER%20GROUP').expect(200);
    const folders = documents.body.data.folders as { name: string; documents: { title: string }[] }[];

    expect(folders).toHaveLength(1);
    expect(folders[0]?.name).toBe('Code of Conduct');
    expect(folders[0]?.documents[0]?.title).toBe('Code of Conduct — Overview');
    expect(documents.body.data.countries).toContain('URBASER GROUP');
  });

  it('groups published documents into folders per country', async () => {
    const first = await createDraft({ title: 'Policies — Overview', category: 'Corporate Policies' });
    const second = await createDraft({ title: 'Policies — Guidelines', category: 'Corporate Policies' });
    const indian = await createDraft({ title: 'India handbook', category: 'Records', country: 'INDIA' });

    for (const item of [first, second, indian]) {
      await patch(session, `/api/content/${item._id}/publish`, { action: 'publish' }).expect(200);
    }

    const group = await request(app).get('/api/public/documents?country=URBASER%20GROUP').expect(200);
    expect(group.body.data.folders).toHaveLength(1);
    expect(group.body.data.folders[0].documents).toHaveLength(2);
    expect(group.body.data.countries).toEqual(expect.arrayContaining(['URBASER GROUP', 'INDIA']));

    const india = await request(app).get('/api/public/documents?country=INDIA').expect(200);
    expect(india.body.data.folders[0].name).toBe('Records');
  });

  it('unpublishes content and the portal stops serving it', async () => {
    const draft = await createDraft();
    await patch(session, `/api/content/${draft._id}/publish`, { action: 'publish' }).expect(200);
    await request(app).get(`/api/public/content/${draft.slug}`).expect(200);

    await patch(session, `/api/content/${draft._id}/publish`, { action: 'unpublish' }).expect(200);
    await request(app).get(`/api/public/content/${draft.slug}`).expect(404);

    const documents = await request(app).get('/api/public/documents').expect(200);
    expect(documents.body.data.folders).toHaveLength(0);
  });

  it('archives content and keeps it out of the portal', async () => {
    const draft = await createDraft();
    await patch(session, `/api/content/${draft._id}/publish`, { action: 'publish' }).expect(200);
    await patch(session, `/api/content/${draft._id}/publish`, { action: 'archive' }).expect(200);
    await request(app).get(`/api/public/content/${draft.slug}`).expect(404);
  });

  it('holds a scheduled item until its time passes', async () => {
    const draft = await createDraft({ title: 'Future document' });
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await patch(session, `/api/content/${draft._id}/publish`, { action: 'schedule', scheduledFor: future }).expect(200);
    await request(app).get(`/api/public/content/${draft.slug}`).expect(404);

    // A past date is refused, so the only way to make it live now is to publish.
    const past = await patch(session, `/api/content/${draft._id}/publish`, {
      action: 'schedule',
      scheduledFor: new Date(Date.now() - 1000).toISOString(),
    });
    expect(past.status).toBe(400);
  });

  it('updates content and keeps a revision of what was replaced', async () => {
    const draft = await createDraft();
    await put(session, `/api/content/${draft._id}`, { title: 'Code of Conduct — Revised' }).expect(200);

    const revisions = await session.agent.get(`/api/content/${draft._id}/revisions`).expect(200);
    expect(revisions.body.data.revisions).toHaveLength(1);
    expect(revisions.body.data.revisions[0].title).toBe('Code of Conduct — Overview');
  });

  it('strips dangerous markup from a submitted body', async () => {
    const draft = await createDraft({
      body: '<p>Fine</p><script>window.alert(1)</script><img src=x onerror="steal()"><a href="javascript:bad()">link</a>',
    });

    const stored = await session.agent.get(`/api/content/${draft._id}`).expect(200);
    const body = stored.body.data.content.body as string;

    expect(body).toContain('<p>Fine</p>');
    expect(body).not.toContain('<script');
    expect(body).not.toContain('onerror');
    expect(body).not.toContain('javascript:');
  });

  it('rejects content without a folder', async () => {
    const response = await post(session, '/api/content', { title: 'No folder document' });
    expect(response.status).toBe(422);
  });

  it('deletes content', async () => {
    const draft = await createDraft();
    await del(session, `/api/content/${draft._id}`).expect(200);
    await session.agent.get(`/api/content/${draft._id}`).expect(404);
  });

  it('lets an authorised admin see drafts that visitors cannot', async () => {
    await createDraft();
    const admin = await session.agent.get('/api/content?status=draft').expect(200);
    expect(admin.body.data.total).toBe(1);
  });
});
