import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { paginate } from '../utils/pagination.js';
import * as contentService from '../services/contentService.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as contentService.ContentListQuery;
  const { items, total } = await contentService.listContent(query);
  res.json({ success: true, data: paginate(items, total, query) });
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const content = await contentService.getContent(req.params.id as string);
  res.json({ success: true, data: { content } });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const content = await contentService.createContent(req, req.body as contentService.ContentInput);
  res.status(201).json({ success: true, data: { content }, message: 'Content created' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const content = await contentService.updateContent(req, req.params.id as string, req.body as contentService.ContentInput);
  res.json({ success: true, data: { content }, message: 'Content updated' });
});

export const setPublication = asyncHandler(async (req: Request, res: Response) => {
  const { action, scheduledFor } = req.body as {
    action: 'publish' | 'unpublish' | 'schedule' | 'archive';
    scheduledFor?: string | null;
  };
  const content = await contentService.setContentPublication(req, req.params.id as string, action, scheduledFor);
  res.json({ success: true, data: { content }, message: `Content ${action}ed` });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await contentService.deleteContent(req, req.params.id as string);
  res.json({ success: true, message: 'Content deleted' });
});

export const revisions = asyncHandler(async (req: Request, res: Response) => {
  const items = await contentService.listContentRevisions(req.params.id as string);
  res.json({ success: true, data: { revisions: items } });
});

export const categories = asyncHandler(async (_req: Request, res: Response) => {
  const items = await contentService.listContentCategories();
  res.json({ success: true, data: { categories: items } });
});

/* ── Public endpoints: the portal's Documents section ───────────────────── */

export const publicDocuments = asyncHandler(async (req: Request, res: Response) => {
  const { country, search } = req.query as unknown as { country: string; search?: string };
  const [folders, countries] = await Promise.all([
    contentService.listPublicDocumentFolders(country, search),
    contentService.listPublicCountries(),
  ]);
  res.json({ success: true, data: { folders, countries } });
});

export const publicDetail = asyncHandler(async (req: Request, res: Response) => {
  const content = await contentService.getPublicContentBySlug(req.params.slug as string);
  res.json({ success: true, data: { content } });
});
