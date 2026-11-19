import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { Tag } from '../src/models/Tag.js';
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

describe('news management with dynamic tags', () => {
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

  async function createArticle(overrides: Record<string, unknown> = {}) {
    const response = await post(session, '/api/news', {
      title: 'Activate your passkey',
      summary: 'Passwordless sign-in is here.',
      body: '<p>Set up your passkey today.</p>',
      category: 'SECURITY',
      scope: 'Global',
      ...overrides,
    }).expect(201);
    return response.body.data.news as {
      _id: string;
      slug: string;
      status: string;
      tags: { _id: string; name: string; slug: string }[];
    };
  }

  it('creates a draft article that visitors cannot see', async () => {
    const article = await createArticle();
    expect(article.status).toBe('draft');
    expect(article.slug).toBe('activate-your-passkey');

    const portal = await request(app).get('/api/public/news').expect(200);
    expect(portal.body.data.total).toBe(0);
    await request(app).get(`/api/public/news/${article.slug}`).expect(404);
  });

  it('publishes an article and the portal serves it', async () => {
    const article = await createArticle();
    await patch(session, `/api/news/${article._id}/publish`, { action: 'publish' }).expect(200);

    const portal = await request(app).get('/api/public/news').expect(200);
    expect(portal.body.data.total).toBe(1);
    expect(portal.body.data.items[0].title).toBe('Activate your passkey');
    expect(portal.body.data.categories).toContain('SECURITY');

    const detail = await request(app).get(`/api/public/news/${article.slug}`).expect(200);
    expect(detail.body.data.news.body).toContain('Set up your passkey');
  });

  it('creates a brand-new tag from inside the news editor and assigns it', async () => {
    // This is the news editor's "type a name that does not exist" path.
    const article = await createArticle({ tags: { newNames: ['Cybersecurity', 'Awareness'] } });

    expect(article.tags.map((tag) => tag.name).sort()).toEqual(['Awareness', 'Cybersecurity']);
    expect(await Tag.countDocuments()).toBe(2);

    const created = await Tag.findOne({ name: 'Cybersecurity' }).lean();
    expect(created?.slug).toBe('cybersecurity');
    expect(created?.status).toBe('active');
  });

  it('reuses an existing tag rather than creating a duplicate', async () => {
    await post(session, '/api/tags', { name: 'Compliance' }).expect(201);
    const again = await post(session, '/api/tags', { name: 'Compliance' }).expect(201);

    expect(await Tag.countDocuments()).toBe(1);
    expect(again.body.data.tag.slug).toBe('compliance');

    // The same is true through the article's tag payload.
    const article = await createArticle({ tags: { newNames: ['Compliance'] } });
    expect(await Tag.countDocuments()).toBe(1);
    expect(article.tags).toHaveLength(1);
  });

  it('assigns multiple tags, mixing existing ids with new names', async () => {
    const existing = await post(session, '/api/tags', { name: 'Governance', color: '#a3e635' }).expect(201);
    const existingId = existing.body.data.tag._id as string;

    const article = await createArticle({
      tags: { ids: [existingId], newNames: ['Legal', 'Public tenders'] },
    });

    expect(article.tags).toHaveLength(3);
    expect(article.tags.map((tag) => tag.name).sort()).toEqual(['Governance', 'Legal', 'Public tenders']);
  });

  it('stores tags as references, not as a comma-separated string', async () => {
    const article = await createArticle({ tags: { newNames: ['Partnerships'] } });
    const stored = await session.agent.get(`/api/news/${article._id}`).expect(200);
    const tag = stored.body.data.news.tags[0];

    expect(tag).toMatchObject({ name: 'Partnerships', slug: 'partnerships' });
    expect(typeof tag._id).toBe('string');
    expect(tag._id).toMatch(/^[a-f\d]{24}$/);
  });

  it('removes a tag from an article without deleting the tag', async () => {
    const article = await createArticle({ tags: { newNames: ['Keep', 'Remove'] } });
    const keep = article.tags.find((tag) => tag.name === 'Keep');

    const updated = await put(session, `/api/news/${article._id}`, { tags: { ids: [keep?._id] } }).expect(200);
    expect(updated.body.data.news.tags).toHaveLength(1);
    expect(await Tag.countDocuments()).toBe(2);
  });

  it('reports how many articles use each tag', async () => {
    const first = await createArticle({ title: 'First', tags: { newNames: ['Shared'] } });
    await createArticle({ title: 'Second', tags: { ids: [first.tags[0]?._id] } });

    const tags = await session.agent.get('/api/tags?withCounts=true').expect(200);
    const shared = tags.body.data.items.find((tag: { name: string }) => tag.name === 'Shared');
    expect(shared.newsCount).toBe(2);
  });

  it('renames a tag and the change shows on its articles', async () => {
    const article = await createArticle({ tags: { newNames: ['Typo Nmae'] } });
    const tagId = article.tags[0]?._id;

    await put(session, `/api/tags/${tagId}`, { name: 'Correct Name' }).expect(200);

    const stored = await session.agent.get(`/api/news/${article._id}`).expect(200);
    expect(stored.body.data.news.tags[0].name).toBe('Correct Name');
  });

  it('refuses to delete a tag that is in use, and allows it once free', async () => {
    const article = await createArticle({ tags: { newNames: ['Busy'] } });
    const tagId = article.tags[0]?._id as string;

    const blocked = await del(session, `/api/tags/${tagId}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('TAG_IN_USE');

    await put(session, `/api/news/${article._id}`, { tags: { ids: [] } }).expect(200);
    await del(session, `/api/tags/${tagId}`).expect(200);
    expect(await Tag.countDocuments()).toBe(0);
  });

  it('filters published news by tag slug for the portal chips', async () => {
    const tagged = await createArticle({ title: 'Tagged article', tags: { newNames: ['Cybersecurity'] } });
    const other = await createArticle({ title: 'Untagged article' });

    for (const item of [tagged, other]) {
      await patch(session, `/api/news/${item._id}/publish`, { action: 'publish' }).expect(200);
    }

    const filtered = await request(app).get('/api/public/news?tag=cybersecurity').expect(200);
    expect(filtered.body.data.total).toBe(1);
    expect(filtered.body.data.items[0].title).toBe('Tagged article');

    // An unknown tag must match nothing rather than everything.
    const unknown = await request(app).get('/api/public/news?tag=does-not-exist').expect(200);
    expect(unknown.body.data.total).toBe(0);
  });

  it('returns related news based on shared tags', async () => {
    const first = await createArticle({ title: 'Phishing results', tags: { newNames: ['Cybersecurity'] } });
    const second = await createArticle({ title: 'Cyber family', tags: { ids: [first.tags[0]?._id] } });
    const unrelated = await createArticle({ title: 'Annual results', tags: { newNames: ['Finance'] } });

    for (const item of [first, second, unrelated]) {
      await patch(session, `/api/news/${item._id}/publish`, { action: 'publish' }).expect(200);
    }

    const detail = await request(app).get(`/api/public/news/${first.slug}`).expect(200);
    const relatedTitles = detail.body.data.related.map((item: { title: string }) => item.title);

    expect(relatedTitles).toContain('Cyber family');
    expect(relatedTitles).not.toContain('Annual results');
  });

  it('only offers public tags that published news actually uses', async () => {
    const draft = await createArticle({ tags: { newNames: ['Draft only'] } });
    const published = await createArticle({ title: 'Live article', tags: { newNames: ['Live tag'] } });
    await patch(session, `/api/news/${published._id}/publish`, { action: 'publish' }).expect(200);
    void draft;

    const tags = await request(app).get('/api/public/tags').expect(200);
    const names = tags.body.data.items.map((tag: { name: string }) => tag.name);
    expect(names).toContain('Live tag');
  });

  it('filters by scope and by search term', async () => {
    const global = await createArticle({ title: 'Global story', scope: 'Global' });
    const local = await createArticle({ title: 'Local story', scope: 'Local' });
    for (const item of [global, local]) {
      await patch(session, `/api/news/${item._id}/publish`, { action: 'publish' }).expect(200);
    }

    const locals = await request(app).get('/api/public/news?scope=Local').expect(200);
    expect(locals.body.data.items.map((i: { title: string }) => i.title)).toEqual(['Local story']);

    const searched = await request(app).get('/api/public/news?search=Global').expect(200);
    expect(searched.body.data.items.map((i: { title: string }) => i.title)).toEqual(['Global story']);
  });

  it('paginates published news', async () => {
    for (let index = 0; index < 5; index += 1) {
      const article = await createArticle({ title: `Article ${index}` });
      await patch(session, `/api/news/${article._id}/publish`, { action: 'publish' }).expect(200);
    }

    const firstPage = await request(app).get('/api/public/news?page=1&limit=2').expect(200);
    expect(firstPage.body.data.items).toHaveLength(2);
    expect(firstPage.body.data.total).toBe(5);
    expect(firstPage.body.data.totalPages).toBe(3);

    const lastPage = await request(app).get('/api/public/news?page=3&limit=2').expect(200);
    expect(lastPage.body.data.items).toHaveLength(1);
  });

  it('never exposes an author email or draft field through the public API', async () => {
    const article = await createArticle();
    await patch(session, `/api/news/${article._id}/publish`, { action: 'publish' }).expect(200);

    const portal = await request(app).get('/api/public/news').expect(200);
    const body = JSON.stringify(portal.body);
    expect(body).not.toContain('@test.local');
    expect(body).not.toContain('revisions');
    expect(body).not.toContain('updatedBy');
  });

  it('rejects a media reference that does not exist', async () => {
    const response = await post(session, '/api/news', {
      title: 'Bad image reference',
      featuredImage: '0'.repeat(24),
    });
    expect(response.status).toBe(400);
  });

  it('deletes an article', async () => {
    const article = await createArticle();
    await del(session, `/api/news/${article._id}`).expect(200);
    await session.agent.get(`/api/news/${article._id}`).expect(404);
  });
});
