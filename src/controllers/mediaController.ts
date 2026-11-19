import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import * as mediaService from '../services/mediaService.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as mediaService.MediaListQuery;
  const { items, total } = await mediaService.listMedia(query);
  res.json({ success: true, data: paginate(items, total, query) });
});

export const upload = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest('No file was uploaded', { field: 'file' });
  const { alt, folder } = req.body as { alt?: string; folder?: string };
  const media = await mediaService.uploadMedia(req, file, { alt, folder });
  res.status(201).json({ success: true, data: { media }, message: 'File uploaded' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const media = await mediaService.updateMedia(req, req.params.id as string, req.body as { alt?: string; folder?: string });
  res.json({ success: true, data: { media }, message: 'Media updated' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { force } = req.query as unknown as { force: boolean };
  await mediaService.deleteMedia(req, req.params.id as string, { force });
  res.json({ success: true, message: 'Media deleted' });
});

export const references = asyncHandler(async (req: Request, res: Response) => {
  const counts = await mediaService.countReferences(req.params.id as string);
  res.json({ success: true, data: { references: counts } });
});
