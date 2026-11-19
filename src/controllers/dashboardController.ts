import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { paginate } from '../utils/pagination.js';
import * as dashboardService from '../services/dashboardService.js';
import * as activityService from '../services/activityService.js';

export const stats = asyncHandler(async (_req: Request, res: Response) => {
  const [statistics, recentContent, recentActivity] = await Promise.all([
    dashboardService.getDashboardStats(),
    dashboardService.getRecentContent(6),
    dashboardService.getRecentActivity(8),
  ]);
  res.json({ success: true, data: { stats: statistics, recentContent, recentActivity } });
});

export const activity = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as Parameters<typeof activityService.listActivity>[0];
  const { items, total } = await activityService.listActivity(query);
  res.json({ success: true, data: paginate(items, total, query) });
});
