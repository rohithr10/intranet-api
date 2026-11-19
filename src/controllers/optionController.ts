import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { paginate } from '../utils/pagination.js';
import * as optionService from '../services/optionService.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as optionService.OptionListQuery;
  const { items, total } = await optionService.listOptions(query);
  res.json({ success: true, data: paginate(items, total, query) });
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const option = await optionService.getOption(req.params.id as string);
  res.json({ success: true, data: { option } });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const option = await optionService.createOption(req, req.body as optionService.OptionInput);
  res.status(201).json({ success: true, data: { option }, message: 'Option created' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const option = await optionService.updateOption(req, req.params.id as string, req.body as optionService.OptionInput);
  res.json({ success: true, data: { option }, message: 'Option updated' });
});

export const setValue = asyncHandler(async (req: Request, res: Response) => {
  const { value } = req.body as { value: unknown };
  const option = await optionService.updateOption(req, req.params.id as string, { value });
  res.json({ success: true, data: { option }, message: 'Option updated' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await optionService.deleteOption(req, req.params.id as string);
  res.json({ success: true, message: 'Option deleted' });
});

/** Effective `{key: value}` configuration for the running frontend. */
export const effective = asyncHandler(async (req: Request, res: Response) => {
  const options = await optionService.getEffectiveOptions(req.auth);
  res.json({ success: true, data: { options } });
});
