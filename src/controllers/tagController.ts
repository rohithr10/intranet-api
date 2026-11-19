import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { paginate } from '../utils/pagination.js';
import * as tagService from '../services/tagService.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as tagService.TagListQuery;
  const { items, total } = await tagService.listTags(query);
  res.json({ success: true, data: paginate(items, total, query) });
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const tag = await tagService.getTag(req.params.id as string);
  res.json({ success: true, data: { tag } });
});

/**
 * Also the endpoint the news editor's tag selector calls when an author types a
 * tag that does not exist yet, which is why an existing name is returned rather
 * than rejected.
 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const tag = await tagService.createTag(req, req.body as tagService.TagInput, { reuseExisting: true });
  res.status(201).json({ success: true, data: { tag }, message: 'Tag ready' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const tag = await tagService.updateTag(req, req.params.id as string, req.body as tagService.TagInput);
  res.json({ success: true, data: { tag }, message: 'Tag updated' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await tagService.deleteTag(req, req.params.id as string);
  res.json({ success: true, message: 'Tag deleted' });
});

/** Active tags for the portal's tag filter chips. */
export const publicList = asyncHandler(async (_req: Request, res: Response) => {
  const query = { page: 1, limit: 100, status: 'active' as const, withCounts: true };
  const { items, total } = await tagService.listTags(query);
  res.json({ success: true, data: paginate(items.filter((t) => t.newsCount > 0), total, query) });
});
