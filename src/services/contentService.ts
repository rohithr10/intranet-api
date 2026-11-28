import type { Request } from 'express';
import { Content } from '../models/Content.js';
import { Media } from '../models/Media.js';
import { Tag } from '../models/Tag.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, sanitizeRichText, stripTags } from '../utils/sanitize.js';
import { slugify, uniqueSlug } from '../utils/slug.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { recordActivity } from './activityService.js';
import { assertStatusAllowed, publicFilter, resolvePublishTransition } from './publishing.js';
import { resolveTagSelection } from './tagService.js';
import type { PublishStatus } from '../types/domain.js';

const POPULATE = [
  { path: 'author', select: 'name email' },
  { path: 'tags', select: 'name slug color' },
  { path: 'featuredImage', select: 'url alt originalName mimeType size' },
  { path: 'attachment', select: 'url originalName mimeType size' },
  { path: 'media', select: 'url alt originalName mimeType size' },
] as const;

export interface ContentListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: PublishStatus;
  category?: string;
  country?: string;
  tag?: string;
}

export async function listContent(query: ContentListQuery) {
  const filter = await buildFilter(query);
  const [items, total] = await Promise.all([
    Content.find(filter)
      .populate([...POPULATE])
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Content.countDocuments(filter),
  ]);
  return { items, total };
}

export async function getContent(id: string) {
  const content = await Content.findById(id).populate([...POPULATE]).lean();
  if (!content) throw ApiError.notFound('Content not found');
  return content;
}

/**
 * The portal's Documents section, grouped into the folders it renders.
 * `category` is the folder name, so this is one query plus a group-by rather
 * than a separate folder collection.
 */
export async function listPublicDocumentFolders(country?: string, search?: string) {
  const filter: Record<string, unknown> = { ...publicFilter() };
  if (country) filter.country = country;
  if (search) {
    const needle = new RegExp(escapeRegex(search), 'i');
    filter.$and = [{ $or: [{ title: needle }, { category: needle }, { summary: needle }] }];
  }

  const items = await Content.find(filter)
    .populate([{ path: 'attachment', select: 'url originalName mimeType size' }])
    .sort({ order: 1, title: 1 })
    .lean();

  const folders = new Map<string, { name: string; country: string; updatedAt: Date; documents: unknown[] }>();
  for (const item of items) {
    const name = String(item.category);
    const itemCountry = String(item.country || 'URBASER GROUP');
    const folder = folders.get(name) ?? { name, country: country ?? itemCountry, updatedAt: new Date(0), documents: [] };
    const attachment = item.attachment as { url?: string; originalName?: string; mimeType?: string; size?: number } | null;
    folder.documents.push({
      id: String(item._id),
      title: item.title,
      slug: item.slug,
      summary: item.summary ?? '',
      body: item.body ?? '',
      publishedAt: item.publishedAt ?? item.createdAt ?? null,
      attachment: attachment?.url
        ? { url: attachment.url, name: attachment.originalName, mimeType: attachment.mimeType, size: attachment.size }
        : null,
    });
    const stamp = new Date((item.updatedAt as Date) ?? (item.createdAt as Date) ?? 0);
    if (stamp > folder.updatedAt) folder.updatedAt = stamp;
    folders.set(name, folder);
  }

  return [...folders.values()];
}

/** Country tabs come from the data, not a hardcoded list. */
export async function listPublicCountries(): Promise<string[]> {
  const countries = await Content.distinct('country', publicFilter());
  const list = countries.filter(Boolean).map(String);
  // The group-wide tab always leads, matching the portal's original ordering.
  return list.sort((a, b) => (a === 'URBASER GROUP' ? -1 : b === 'URBASER GROUP' ? 1 : a.localeCompare(b)));
}

export async function getPublicContentBySlug(slug: string) {
  const content = await Content.findOne({ slug, ...publicFilter() }).populate([...POPULATE]).lean();
  if (!content) throw ApiError.notFound('Content not found');
  return content;
}

export interface ContentInput {
  title: string;
  slug?: string;
  summary?: string;
  body?: string;
  featuredImage?: string | null;
  attachment?: string | null;
  media?: string[];
  category: string;
  country?: string;
  tags?: { ids?: string[]; newNames?: string[] };
  status?: PublishStatus;
  scheduledFor?: string | null;
  order?: number;
}

export async function createContent(req: Request, input: ContentInput) {
  assertStatusAllowed(req, input.status, PERMISSIONS.CONTENT_PUBLISH);
  await assertMediaExists([input.featuredImage, input.attachment, ...(input.media ?? [])]);

  const tags = await resolveTagSelection(req, input.tags);
  const slug = await uniqueSlug(input.slug ?? input.title, async (c) => Boolean(await Content.exists({ slug: c })));
  const status = input.status ?? 'draft';

  const content = await Content.create({
    title: stripTags(input.title),
    slug,
    summary: input.summary ? stripTags(input.summary) : '',
    body: input.body ? sanitizeRichText(input.body) : '',
    featuredImage: input.featuredImage || null,
    attachment: input.attachment || null,
    media: input.media ?? [],
    category: stripTags(input.category),
    country: input.country ?? 'URBASER GROUP',
    tags,
    author: req.auth?.userId,
    status,
    publishedAt: status === 'published' ? new Date() : null,
    scheduledFor: status === 'scheduled' && input.scheduledFor ? new Date(input.scheduledFor) : null,
    order: input.order ?? 0,
    updatedBy: req.auth?.userId ?? null,
  });

  await recordActivity(req, {
    action: 'content.create',
    entity: 'Content',
    entityId: String(content._id),
    description: `Created content "${content.title}" (${status})`,
  });

  return getContent(String(content._id));
}

export async function updateContent(req: Request, id: string, input: Partial<ContentInput>) {
  const content = await Content.findById(id).select('+revisions');
  if (!content) throw ApiError.notFound('Content not found');
  assertStatusAllowed(req, input.status, PERMISSIONS.CONTENT_PUBLISH);
  await assertMediaExists([input.featuredImage, input.attachment, ...(input.media ?? [])]);

  content.revisions.push({
    title: content.title,
    summary: content.summary ?? '',
    body: content.body ?? '',
    status: content.status ?? 'draft',
    editedBy: req.auth?.userId ?? null,
    editedAt: new Date(),
  } as never);
  if (content.revisions.length > 20) content.revisions.splice(0, content.revisions.length - 20);

  if (input.title !== undefined) content.set('title', stripTags(input.title));
  if (input.summary !== undefined) content.set('summary', stripTags(input.summary));
  if (input.body !== undefined) content.set('body', sanitizeRichText(input.body));
  if (input.featuredImage !== undefined) content.set('featuredImage', input.featuredImage || null);
  if (input.attachment !== undefined) content.set('attachment', input.attachment || null);
  if (input.media !== undefined) content.set('media', input.media);
  if (input.category !== undefined) content.set('category', stripTags(input.category));
  if (input.country !== undefined) content.set('country', input.country);
  if (input.order !== undefined) content.set('order', input.order);
  if (input.tags !== undefined) content.set('tags', await resolveTagSelection(req, input.tags));

  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    if (slug !== content.slug && (await Content.exists({ slug }))) {
      throw ApiError.conflict('Content with that slug already exists', { field: 'slug' });
    }
    content.set('slug', slug);
  }

  if (input.status !== undefined && input.status !== content.status) {
    content.set('status', input.status);
    if (input.status === 'published') content.set('publishedAt', content.publishedAt ?? new Date());
    if (input.status === 'draft' || input.status === 'archived') content.set('publishedAt', null);
    if (input.status === 'scheduled' && input.scheduledFor) content.set('scheduledFor', new Date(input.scheduledFor));
  }

  content.set('updatedBy', req.auth?.userId ?? null);
  await content.save();

  await recordActivity(req, {
    action: 'content.update',
    entity: 'Content',
    entityId: String(content._id),
    description: `Updated content "${content.title}"`,
    meta: { fields: Object.keys(input) },
  });

  return getContent(String(content._id));
}

export async function setContentPublication(
  req: Request,
  id: string,
  action: 'publish' | 'unpublish' | 'schedule' | 'archive',
  scheduledFor?: string | null,
) {
  const content = await Content.findById(id);
  if (!content) throw ApiError.notFound('Content not found');

  const transition = resolvePublishTransition(req, action, PERMISSIONS.CONTENT_PUBLISH, scheduledFor);
  content.set('status', transition.status);
  content.set('publishedAt', transition.publishedAt);
  content.set('scheduledFor', transition.scheduledFor);
  content.set('updatedBy', req.auth?.userId ?? null);
  await content.save();

  await recordActivity(req, {
    action: `content.${action}`,
    entity: 'Content',
    entityId: String(content._id),
    description: `${action[0]?.toUpperCase()}${action.slice(1)}ed content "${content.title}"`,
  });

  return getContent(String(content._id));
}

export async function deleteContent(req: Request, id: string) {
  const content = await Content.findById(id);
  if (!content) throw ApiError.notFound('Content not found');
  await content.deleteOne();
  await recordActivity(req, {
    action: 'content.delete',
    entity: 'Content',
    entityId: id,
    description: `Deleted content "${content.title}"`,
  });
}

export async function listContentRevisions(id: string) {
  const content = await Content.findById(id)
    .select('+revisions')
    .populate('revisions.editedBy', 'name email')
    .lean();
  if (!content) throw ApiError.notFound('Content not found');
  return (content.revisions ?? []).slice().reverse();
}

export async function listContentCategories(): Promise<string[]> {
  const categories = await Content.distinct('category');
  return categories.filter(Boolean).map(String).sort();
}

async function buildFilter(query: ContentListQuery): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.country) filter.country = query.country;
  if (query.search) {
    const needle = new RegExp(escapeRegex(query.search), 'i');
    filter.$and = [{ $or: [{ title: needle }, { summary: needle }, { category: needle }] }];
  }
  if (query.tag) {
    const tag = await Tag.findOne({
      $or: [{ slug: query.tag.toLowerCase() }, ...(/^[a-f\d]{24}$/i.test(query.tag) ? [{ _id: query.tag }] : [])],
    })
      .select('_id')
      .lean();
    filter.tags = tag?._id ?? null;
  }
  return filter;
}

async function assertMediaExists(ids: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  const found = await Media.countDocuments({ _id: { $in: unique } });
  if (found !== unique.length) throw ApiError.badRequest('One or more media items do not exist', { field: 'media' });
}
