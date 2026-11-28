import type { Request } from 'express';
import { Media } from '../models/Media.js';
import { News } from '../models/News.js';
import { Tag } from '../models/Tag.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, sanitizeRichText, stripTags } from '../utils/sanitize.js';
import { slugify, uniqueSlug } from '../utils/slug.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { recordActivity } from './activityService.js';
import { assertStatusAllowed, publicFilter, resolvePublishTransition } from './publishing.js';
import { resolveTagSelection } from './tagService.js';
import type { NewsScope, PublishStatus } from '../types/domain.js';

const POPULATE = [
  { path: 'author', select: 'name email' },
  { path: 'tags', select: 'name slug color' },
  { path: 'featuredImage', select: 'url alt originalName mimeType size' },
  { path: 'images', select: 'url alt originalName mimeType size' },
] as const;

export interface NewsListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: PublishStatus;
  scope?: NewsScope;
  category?: string;
  tag?: string;
  featured?: boolean;
}

/** Admin listing: every status, newest first. */
export async function listNews(query: NewsListQuery) {
  const filter = await buildFilter(query);

  const [items, total] = await Promise.all([
    News.find(filter)
      .populate([...POPULATE])
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    News.countDocuments(filter),
  ]);

  return { items, total };
}

/** Public listing: only what is actually live. */
export async function listPublicNews(query: NewsListQuery) {
  const filter = { ...(await buildFilter({ ...query, status: undefined })), ...publicFilter() };

  const [items, total] = await Promise.all([
    News.find(filter)
      .populate([...POPULATE])
      .sort({ isFeatured: -1, publishedAt: -1, createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    News.countDocuments(filter),
  ]);

  return { items: items.map(toPublicShape), total };
}

export async function getNews(id: string) {
  const article = await News.findById(id).populate([...POPULATE]).lean();
  if (!article) throw ApiError.notFound('News article not found');
  return article;
}

export async function getPublicNewsBySlug(slug: string) {
  const article = await News.findOne({ slug, ...publicFilter() }).populate([...POPULATE]).lean();
  if (!article) throw ApiError.notFound('News article not found');
  return toPublicShape(article);
}

/** Related articles share at least one tag with the given article. */
export async function listRelatedNews(slug: string, limit = 3) {
  const article = await News.findOne({ slug, ...publicFilter() }).select('tags category').lean();
  if (!article) throw ApiError.notFound('News article not found');

  const tagIds = (article.tags ?? []) as unknown[];
  const related = await News.find({
    slug: { $ne: slug },
    ...publicFilter(),
    ...(tagIds.length > 0 ? { tags: { $in: tagIds } } : { category: article.category }),
  })
    .populate([...POPULATE])
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();

  return related.map(toPublicShape);
}

export interface NewsInput {
  title: string;
  slug?: string;
  summary?: string;
  body?: string;
  featuredImage?: string | null;
  images?: string[];
  category?: string;
  scope?: NewsScope;
  tags?: { ids?: string[]; newNames?: string[] };
  status?: PublishStatus;
  scheduledFor?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  isFeatured?: boolean;
}

export async function createNews(req: Request, input: NewsInput) {
  assertStatusAllowed(req, input.status, PERMISSIONS.NEWS_PUBLISH);
  await assertMediaExists([input.featuredImage, ...(input.images ?? [])]);

  const tags = await resolveTagSelection(req, input.tags);
  const slug = await uniqueSlug(input.slug ?? input.title, async (c) => Boolean(await News.exists({ slug: c })));
  const status = input.status ?? 'draft';

  const article = await News.create({
    title: stripTags(input.title),
    slug,
    summary: input.summary ? stripTags(input.summary) : '',
    body: input.body ? sanitizeRichText(input.body) : '',
    featuredImage: input.featuredImage || null,
    images: input.images ?? [],
    category: input.category ?? 'GENERAL',
    scope: input.scope ?? 'Global',
    tags,
    author: req.auth?.userId,
    status,
    publishedAt: status === 'published' ? new Date() : null,
    scheduledFor: status === 'scheduled' && input.scheduledFor ? new Date(input.scheduledFor) : null,
    seoTitle: input.seoTitle ?? '',
    seoDescription: input.seoDescription ?? '',
    isFeatured: input.isFeatured ?? false,
    updatedBy: req.auth?.userId ?? null,
  });

  await recordActivity(req, {
    action: 'news.create',
    entity: 'News',
    entityId: String(article._id),
    description: `Created news article "${article.title}" (${status})`,
  });

  return getNews(String(article._id));
}

export async function updateNews(req: Request, id: string, input: Partial<NewsInput>) {
  const article = await News.findById(id).select('+revisions');
  if (!article) throw ApiError.notFound('News article not found');
  assertStatusAllowed(req, input.status, PERMISSIONS.NEWS_PUBLISH);
  await assertMediaExists([input.featuredImage, ...(input.images ?? [])]);

  // Snapshot before overwriting so an editor can see what changed.
  article.revisions.push({
    title: article.title,
    summary: article.summary ?? '',
    body: article.body ?? '',
    status: article.status ?? 'draft',
    editedBy: req.auth?.userId ?? null,
    editedAt: new Date(),
  } as never);
  if (article.revisions.length > 20) article.revisions.splice(0, article.revisions.length - 20);

  if (input.title !== undefined) article.set('title', stripTags(input.title));
  if (input.summary !== undefined) article.set('summary', stripTags(input.summary));
  if (input.body !== undefined) article.set('body', sanitizeRichText(input.body));
  if (input.featuredImage !== undefined) article.set('featuredImage', input.featuredImage || null);
  if (input.images !== undefined) article.set('images', input.images);
  if (input.category !== undefined) article.set('category', input.category);
  if (input.scope !== undefined) article.set('scope', input.scope);
  if (input.seoTitle !== undefined) article.set('seoTitle', input.seoTitle);
  if (input.seoDescription !== undefined) article.set('seoDescription', input.seoDescription);
  if (input.isFeatured !== undefined) article.set('isFeatured', input.isFeatured);
  if (input.tags !== undefined) article.set('tags', await resolveTagSelection(req, input.tags));

  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    if (slug !== article.slug && (await News.exists({ slug }))) {
      throw ApiError.conflict('A news article with that slug already exists', { field: 'slug' });
    }
    article.set('slug', slug);
  }

  if (input.status !== undefined && input.status !== article.status) {
    article.set('status', input.status);
    if (input.status === 'published') article.set('publishedAt', article.publishedAt ?? new Date());
    if (input.status === 'draft' || input.status === 'archived') article.set('publishedAt', null);
    if (input.status === 'scheduled' && input.scheduledFor) article.set('scheduledFor', new Date(input.scheduledFor));
  }

  article.set('updatedBy', req.auth?.userId ?? null);
  await article.save();

  await recordActivity(req, {
    action: 'news.update',
    entity: 'News',
    entityId: String(article._id),
    description: `Updated news article "${article.title}"`,
    meta: { fields: Object.keys(input) },
  });

  return getNews(String(article._id));
}

export async function setNewsPublication(
  req: Request,
  id: string,
  action: 'publish' | 'unpublish' | 'schedule' | 'archive',
  scheduledFor?: string | null,
) {
  const article = await News.findById(id);
  if (!article) throw ApiError.notFound('News article not found');

  const transition = resolvePublishTransition(req, action, PERMISSIONS.NEWS_PUBLISH, scheduledFor);
  article.set('status', transition.status);
  article.set('publishedAt', transition.publishedAt);
  article.set('scheduledFor', transition.scheduledFor);
  article.set('updatedBy', req.auth?.userId ?? null);
  await article.save();

  await recordActivity(req, {
    action: `news.${action}`,
    entity: 'News',
    entityId: String(article._id),
    description: `${action[0]?.toUpperCase()}${action.slice(1)}ed news article "${article.title}"`,
  });

  return getNews(String(article._id));
}

export async function deleteNews(req: Request, id: string) {
  const article = await News.findById(id);
  if (!article) throw ApiError.notFound('News article not found');
  await article.deleteOne();
  await recordActivity(req, {
    action: 'news.delete',
    entity: 'News',
    entityId: id,
    description: `Deleted news article "${article.title}"`,
  });
}

export async function listNewsRevisions(id: string) {
  const article = await News.findById(id)
    .select('+revisions')
    .populate('revisions.editedBy', 'name email')
    .lean();
  if (!article) throw ApiError.notFound('News article not found');
  return (article.revisions ?? []).slice().reverse();
}

/** Categories actually in use, for the portal's category filter. */
export async function listNewsCategories(): Promise<string[]> {
  const categories = await News.distinct('category', publicFilter());
  return categories.filter(Boolean).map(String).sort();
}

async function buildFilter(query: NewsListQuery): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.scope) filter.scope = query.scope;
  if (query.category) filter.category = query.category.toUpperCase();
  if (query.featured !== undefined) filter.isFeatured = query.featured;
  if (query.search) {
    const needle = new RegExp(escapeRegex(query.search), 'i');
    filter.$and = [{ $or: [{ title: needle }, { summary: needle }] }];
  }

  // A tag filter accepts a slug (what the portal's clickable chips send) or an id.
  if (query.tag) {
    const tag = await Tag.findOne({ $or: [{ slug: query.tag.toLowerCase() }, ...(isObjectId(query.tag) ? [{ _id: query.tag }] : [])] })
      .select('_id')
      .lean();
    // An unknown tag must match nothing rather than silently matching everything.
    filter.tags = tag?._id ?? null;
  }

  return filter;
}

function isObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

async function assertMediaExists(ids: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  const found = await Media.countDocuments({ _id: { $in: unique } });
  if (found !== unique.length) throw ApiError.badRequest('One or more media items do not exist', { field: 'media' });
}

/** Trims internal fields (author email, revisions, raw ids) from public payloads. */
function toPublicShape(article: Record<string, unknown>) {
  const author = article.author as { name?: string } | null;
  const featured = article.featuredImage as { url?: string; alt?: string } | null;
  return {
    id: String(article._id),
    title: article.title,
    slug: article.slug,
    summary: article.summary ?? '',
    body: article.body ?? '',
    category: article.category ?? 'GENERAL',
    scope: article.scope ?? 'Global',
    tags: ((article.tags ?? []) as { _id: unknown; name: string; slug: string; color?: string | null }[]).map((tag) => ({
      id: String(tag._id),
      name: tag.name,
      slug: tag.slug,
      color: tag.color ?? null,
    })),
    author: author?.name ?? '',
    image: featured?.url ?? null,
    imageAlt: featured?.alt ?? '',
    publishedAt: article.publishedAt ?? article.createdAt ?? null,
    isFeatured: Boolean(article.isFeatured),
    seoTitle: article.seoTitle ?? '',
    seoDescription: article.seoDescription ?? '',
  };
}
