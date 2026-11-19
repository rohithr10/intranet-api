import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { paginate } from '../utils/pagination.js';
import * as newsService from '../services/newsService.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as newsService.NewsListQuery;
  const { items, total } = await newsService.listNews(query);
  res.json({ success: true, data: paginate(items, total, query) });
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const article = await newsService.getNews(req.params.id as string);
  res.json({ success: true, data: { news: article } });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const article = await newsService.createNews(req, req.body as newsService.NewsInput);
  res.status(201).json({ success: true, data: { news: article }, message: 'News article created' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const article = await newsService.updateNews(req, req.params.id as string, req.body as newsService.NewsInput);
  res.json({ success: true, data: { news: article }, message: 'News article updated' });
});

export const setPublication = asyncHandler(async (req: Request, res: Response) => {
  const { action, scheduledFor } = req.body as {
    action: 'publish' | 'unpublish' | 'schedule' | 'archive';
    scheduledFor?: string | null;
  };
  const article = await newsService.setNewsPublication(req, req.params.id as string, action, scheduledFor);
  res.json({ success: true, data: { news: article }, message: `News ${action}ed` });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await newsService.deleteNews(req, req.params.id as string);
  res.json({ success: true, message: 'News article deleted' });
});

export const revisions = asyncHandler(async (req: Request, res: Response) => {
  const items = await newsService.listNewsRevisions(req.params.id as string);
  res.json({ success: true, data: { revisions: items } });
});

/* ── Public endpoints: published articles only ──────────────────────────── */

export const publicList = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as newsService.NewsListQuery;
  const [{ items, total }, categories] = await Promise.all([
    newsService.listPublicNews(query),
    newsService.listNewsCategories(),
  ]);
  res.json({ success: true, data: { ...paginate(items, total, query), categories } });
});

export const publicDetail = asyncHandler(async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const [article, related] = await Promise.all([
    newsService.getPublicNewsBySlug(slug),
    newsService.listRelatedNews(slug, 3),
  ]);
  res.json({ success: true, data: { news: article, related } });
});
