import type { Request } from 'express';
import { Content } from '../models/Content.js';
import { News } from '../models/News.js';
import { Tag } from '../models/Tag.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, stripTags } from '../utils/sanitize.js';
import { slugify, uniqueSlug } from '../utils/slug.js';
import { recordActivity } from './activityService.js';
import type { ActiveStatus } from '../types/domain.js';

export interface TagListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: ActiveStatus;
  withCounts?: boolean;
}

/**
 * Tags with the number of articles using each one. The count is an aggregation
 * over News/Content rather than a denormalised field, so it cannot drift out of
 * step with reality.
 */
export async function listTags(query: TagListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.search) filter.name = new RegExp(escapeRegex(query.search), 'i');

  const [items, total] = await Promise.all([
    Tag.find(filter)
      .sort({ name: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Tag.countDocuments(filter),
  ]);

  if (!query.withCounts) return { items: items.map((t) => ({ ...t, newsCount: 0, contentCount: 0 })), total };

  const ids = items.map((t) => t._id);
  const [newsCounts, contentCounts] = await Promise.all([
    News.aggregate<{ _id: unknown; count: number }>([
      { $match: { tags: { $in: ids } } },
      { $unwind: '$tags' },
      { $match: { tags: { $in: ids } } },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
    ]),
    Content.aggregate<{ _id: unknown; count: number }>([
      { $match: { tags: { $in: ids } } },
      { $unwind: '$tags' },
      { $match: { tags: { $in: ids } } },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
    ]),
  ]);

  const newsBy = new Map(newsCounts.map((c) => [String(c._id), c.count]));
  const contentBy = new Map(contentCounts.map((c) => [String(c._id), c.count]));

  return {
    items: items.map((tag) => ({
      ...tag,
      newsCount: newsBy.get(String(tag._id)) ?? 0,
      contentCount: contentBy.get(String(tag._id)) ?? 0,
    })),
    total,
  };
}

export async function getTag(id: string) {
  const tag = await Tag.findById(id).lean();
  if (!tag) throw ApiError.notFound('Tag not found');
  return tag;
}

export interface TagInput {
  name: string;
  slug?: string;
  description?: string;
  color?: string | null;
  status?: ActiveStatus;
}

/**
 * Creates a tag. Called both from Tags Management and inline from the news
 * editor's tag selector, which is why a duplicate name returns the existing
 * tag instead of an error: the editor's intent is "make sure this tag exists".
 */
export async function createTag(req: Request, input: TagInput, { reuseExisting = false } = {}) {
  const name = stripTags(input.name);
  if (!name) throw ApiError.badRequest('A tag name is required', { field: 'name' });

  const existing = await Tag.findOne({ slug: slugify(input.slug ?? name) }).lean();
  if (existing) {
    if (reuseExisting) return existing;
    throw ApiError.conflict('A tag with that name already exists', { field: 'name' });
  }

  const slug = await uniqueSlug(input.slug ?? name, async (candidate) => Boolean(await Tag.exists({ slug: candidate })));

  const tag = await Tag.create({
    name,
    slug,
    description: input.description ? stripTags(input.description) : '',
    color: input.color ?? null,
    status: input.status ?? 'active',
    createdBy: req.auth?.userId ?? null,
  });

  await recordActivity(req, {
    action: 'news.tags.create',
    entity: 'Tag',
    entityId: String(tag._id),
    description: `Created tag ${tag.name}`,
  });

  return tag.toObject();
}

export async function updateTag(req: Request, id: string, input: Partial<TagInput>) {
  const tag = await Tag.findById(id);
  if (!tag) throw ApiError.notFound('Tag not found');

  if (input.name !== undefined) tag.set('name', stripTags(input.name));
  if (input.description !== undefined) tag.set('description', stripTags(input.description));
  if (input.color !== undefined) tag.set('color', input.color);
  if (input.status !== undefined) tag.set('status', input.status);
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    if (slug !== tag.slug && (await Tag.exists({ slug }))) {
      throw ApiError.conflict('A tag with that slug already exists', { field: 'slug' });
    }
    tag.set('slug', slug);
  }

  await tag.save();
  await recordActivity(req, {
    action: 'news.tags.update',
    entity: 'Tag',
    entityId: String(tag._id),
    description: `Updated tag ${tag.name}`,
  });

  return tag.toObject();
}

/** Deletes a tag only when nothing references it — no silent orphaning. */
export async function deleteTag(req: Request, id: string) {
  const tag = await Tag.findById(id);
  if (!tag) throw ApiError.notFound('Tag not found');

  const [newsCount, contentCount] = await Promise.all([
    News.countDocuments({ tags: tag._id }),
    Content.countDocuments({ tags: tag._id }),
  ]);
  if (newsCount + contentCount > 0) {
    throw ApiError.conflict(
      `This tag is used by ${newsCount} news article(s) and ${contentCount} content item(s). Remove it from them first.`,
      { code: 'TAG_IN_USE', details: { newsCount, contentCount } },
    );
  }

  await tag.deleteOne();
  await recordActivity(req, {
    action: 'news.tags.delete',
    entity: 'Tag',
    entityId: id,
    description: `Deleted tag ${tag.name}`,
  });
}

/**
 * Resolves the news editor's tag selector payload into ObjectIds.
 *
 * Accepts existing tag ids and brand-new names in the same array, which is what
 * lets an author type a tag that does not exist yet and keep going without
 * leaving the form.
 */
export async function resolveTagSelection(
  req: Request,
  selection: { ids?: string[]; newNames?: string[] } | undefined,
): Promise<string[]> {
  if (!selection) return [];
  const ids = [...new Set(selection.ids ?? [])];

  if (ids.length > 0) {
    const found = await Tag.countDocuments({ _id: { $in: ids } });
    if (found !== ids.length) throw ApiError.badRequest('One or more tags do not exist', { field: 'tags' });
  }

  const created: string[] = [];
  for (const rawName of selection.newNames ?? []) {
    const name = stripTags(rawName);
    if (!name) continue;
    const tag = await createTag(req, { name }, { reuseExisting: true });
    created.push(String((tag as { _id: unknown })._id));
  }

  return [...new Set([...ids, ...created])];
}
