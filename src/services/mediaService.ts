import type { Request } from 'express';
import { Content } from '../models/Content.js';
import { Media } from '../models/Media.js';
import { News } from '../models/News.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, stripTags } from '../utils/sanitize.js';
import { storage } from '../utils/storage.js';
import { env } from '../config/environment.js';
import { recordActivity } from './activityService.js';

/**
 * Only these types may be stored. An allow-list beats a deny-list here: an
 * uploaded .svg or .html would run script in the context of the site that
 * serves it, and the browser-sniffed type on a renamed file cannot be trusted.
 */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const MAGIC_NUMBERS: { mime: string; test: (buffer: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/gif', test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 4).toString('ascii') === '%PDF' },
];

export interface MediaListQuery {
  page: number;
  limit: number;
  search?: string;
  mimeType?: string;
  folder?: string;
}

export async function listMedia(query: MediaListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.folder) filter.folder = query.folder;
  if (query.mimeType) filter.mimeType = new RegExp(`^${escapeRegex(query.mimeType)}`, 'i');
  if (query.search) {
    const needle = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ originalName: needle }, { alt: needle }];
  }

  const [items, total] = await Promise.all([
    Media.find(filter)
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Media.countDocuments(filter),
  ]);

  return { items, total };
}

export async function uploadMedia(
  req: Request,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  meta: { alt?: string; folder?: string },
) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw ApiError.badRequest(`Files of type ${file.mimetype} are not allowed`, { code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  if (file.size > env.storage.maxUploadBytes) {
    throw ApiError.payloadTooLarge(
      `File is larger than the ${Math.round(env.storage.maxUploadBytes / (1024 * 1024))}MB limit`,
    );
  }

  // The declared type must match the bytes: a .php renamed to .png is rejected.
  const signature = MAGIC_NUMBERS.find((entry) => entry.mime === file.mimetype);
  if (signature && !signature.test(file.buffer)) {
    throw ApiError.badRequest('File contents do not match its declared type', { code: 'CONTENT_MISMATCH' });
  }

  const stored = await storage.save(file.buffer, file.originalname);

  const media = await Media.create({
    filename: stored.storageKey.split('/').pop() ?? stored.storageKey,
    originalName: stripTags(file.originalname).slice(0, 200),
    mimeType: file.mimetype,
    size: stored.size,
    storageKey: stored.storageKey,
    url: stored.url,
    alt: meta.alt ? stripTags(meta.alt) : '',
    folder: meta.folder ?? 'general',
    uploadedBy: req.auth?.userId ?? null,
  });

  await recordActivity(req, {
    action: 'media.upload',
    entity: 'Media',
    entityId: String(media._id),
    description: `Uploaded ${media.originalName} (${Math.round(media.size / 1024)}KB)`,
  });

  return media.toObject();
}

export async function updateMedia(req: Request, id: string, input: { alt?: string; folder?: string }) {
  const media = await Media.findById(id);
  if (!media) throw ApiError.notFound('Media not found');
  if (input.alt !== undefined) media.set('alt', stripTags(input.alt));
  if (input.folder !== undefined) media.set('folder', input.folder);
  await media.save();

  await recordActivity(req, {
    action: 'media.update',
    entity: 'Media',
    entityId: String(media._id),
    description: `Updated media ${media.originalName}`,
  });

  return media.toObject();
}

/** Refuses to delete anything still referenced, and reports what is using it. */
export async function deleteMedia(req: Request, id: string, { force = false } = {}) {
  const media = await Media.findById(id);
  if (!media) throw ApiError.notFound('Media not found');

  const references = await countReferences(id);
  const total = references.news + references.content;
  if (total > 0 && !force) {
    throw ApiError.conflict(
      `This file is used by ${references.news} news article(s) and ${references.content} content item(s).`,
      { code: 'MEDIA_IN_USE', details: references },
    );
  }

  if (force && total > 0) {
    // Detach first so nothing is left pointing at a file that no longer exists.
    await Promise.all([
      News.updateMany({ featuredImage: media._id }, { $set: { featuredImage: null } }),
      News.updateMany({ images: media._id }, { $pull: { images: media._id } }),
      Content.updateMany({ featuredImage: media._id }, { $set: { featuredImage: null } }),
      Content.updateMany({ attachment: media._id }, { $set: { attachment: null } }),
      Content.updateMany({ media: media._id }, { $pull: { media: media._id } }),
    ]);
  }

  // Remove the record first: a dangling file on disk is recoverable, a record
  // pointing at nothing breaks every page that renders it.
  await media.deleteOne();
  await storage.remove(media.storageKey);

  await recordActivity(req, {
    action: 'media.delete',
    entity: 'Media',
    entityId: id,
    description: `Deleted media ${media.originalName}${force && total > 0 ? ' (detached from referencing items)' : ''}`,
  });
}

export async function countReferences(id: string): Promise<{ news: number; content: number }> {
  const [news, content] = await Promise.all([
    News.countDocuments({ $or: [{ featuredImage: id }, { images: id }] }),
    Content.countDocuments({ $or: [{ featuredImage: id }, { attachment: id }, { media: id }] }),
  ]);
  return { news, content };
}
