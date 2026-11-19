import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { paginate } from '../utils/pagination.js';
import * as serviceService from '../services/serviceService.js';
import type { ServiceStatus } from '../types/domain.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as serviceService.ServiceListQuery;
  const { items, total } = await serviceService.listServices(query);
  res.json({ success: true, data: paginate(items, total, query) });
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const service = await serviceService.getService(req.params.id as string);
  res.json({ success: true, data: { service } });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const service = await serviceService.createService(req, req.body as serviceService.ServiceInput);
  res.status(201).json({ success: true, data: { service }, message: 'Service created' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const service = await serviceService.updateService(req, req.params.id as string, req.body as serviceService.ServiceInput);
  res.json({ success: true, data: { service }, message: 'Service updated' });
});

export const setStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: ServiceStatus };
  const service = await serviceService.setServiceStatus(req, req.params.id as string, status);
  res.json({ success: true, data: { service }, message: `Service ${status}` });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await serviceService.deleteService(req, req.params.id as string);
  res.json({ success: true, message: 'Service deleted' });
});

/** Applications section of the portal — enabled, visible services only. */
export const publicList = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query as { search?: string };
  const services = await serviceService.listVisibleServices(req.auth, search);
  res.json({ success: true, data: { services, tabs: serviceService.tabsFor(services) } });
});
