import type { Request } from 'express';
import { Role } from '../models/Role.js';
import { Service } from '../models/Service.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/sanitize.js';
import { slugify } from '../utils/slug.js';
import { recordActivity } from './activityService.js';
import type { AuthContext, ServiceStatus, ServiceVisibility } from '../types/domain.js';

export interface ServiceListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: ServiceStatus;
  tab?: string;
  category?: string;
}

export async function listServices(query: ServiceListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.tab) filter.tab = query.tab.toUpperCase();
  if (query.category) filter.category = query.category;
  if (query.search) {
    const needle = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: needle }, { key: needle }, { description: needle }];
  }

  const [items, total] = await Promise.all([
    Service.find(filter)
      .populate('roles', 'name key')
      .sort({ tab: 1, order: 1, name: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Service.countDocuments(filter),
  ]);

  return { items, total };
}

export async function getService(id: string) {
  const service = await Service.findById(id).populate('roles', 'name key').lean();
  if (!service) throw ApiError.notFound('Service not found');
  return service;
}

/**
 * What the portal's Applications section renders.
 *
 * Disabled services are filtered out here, so a toggle in the admin takes the
 * tile away for everyone — the frontend never receives it and cannot show it.
 * `restricted` services are additionally limited to their assigned roles.
 */
export async function listVisibleServices(auth: AuthContext | undefined, search?: string) {
  const filter: Record<string, unknown> = { status: 'enabled' };

  if (!auth) {
    filter.visibility = 'public';
  } else if (!auth.isSuperAdmin) {
    filter.$or = [
      { visibility: { $in: ['public', 'authenticated'] } },
      { visibility: 'restricted', roles: auth.roleId },
    ];
  }

  if (search) {
    const needle = new RegExp(escapeRegex(search), 'i');
    const searchClause = [{ name: needle }, { description: needle }];
    filter.$and = [{ $or: searchClause }];
  }

  const services = await Service.find(filter).sort({ tab: 1, order: 1, name: 1 }).lean();

  // Role assignments and raw config are internal; the portal needs neither.
  return services.map((service) => ({
    id: String(service._id),
    name: service.name,
    key: service.key,
    description: service.description ?? '',
    icon: service.icon ?? 'LayoutGrid',
    category: service.category ?? 'GENERAL',
    tab: service.tab ?? 'GENERAL',
    url: service.url ?? '',
  }));
}

/**
 * Tab names for the portal's tab strip, derived from the services the caller
 * can actually see. Deriving them from the visible set (rather than every
 * service) means a visitor is never offered a tab that would be empty for them.
 */
export function tabsFor(services: { tab: string }[]): string[] {
  const tabs = [...new Set(services.map((service) => service.tab).filter(Boolean))];
  tabs.sort((a, b) => (a === 'GENERAL' ? -1 : b === 'GENERAL' ? 1 : a.localeCompare(b)));
  return tabs.length > 0 ? tabs : ['GENERAL'];
}

export interface ServiceInput {
  name: string;
  key?: string;
  description?: string;
  icon?: string;
  category?: string;
  tab?: string;
  url?: string;
  status?: ServiceStatus;
  visibility?: ServiceVisibility;
  roles?: string[];
  config?: Record<string, unknown>;
  order?: number;
}

export async function createService(req: Request, input: ServiceInput) {
  const key = slugify(input.key ?? input.name);
  if (!key) throw ApiError.badRequest('A service key is required', { field: 'key' });
  if (await Service.exists({ key })) throw ApiError.conflict('A service with that key already exists', { field: 'key' });

  await assertRolesExist(input.roles);

  const service = await Service.create({
    ...input,
    key,
    createdBy: req.auth?.userId ?? null,
    updatedBy: req.auth?.userId ?? null,
  });

  await recordActivity(req, {
    action: 'services.create',
    entity: 'Service',
    entityId: String(service._id),
    description: `Created service ${service.name}`,
  });

  return getService(String(service._id));
}

export async function updateService(req: Request, id: string, input: Partial<ServiceInput>) {
  const service = await Service.findById(id);
  if (!service) throw ApiError.notFound('Service not found');

  if (input.key !== undefined) {
    const key = slugify(input.key);
    if (key !== service.key && (await Service.exists({ key }))) {
      throw ApiError.conflict('A service with that key already exists', { field: 'key' });
    }
    service.set('key', key);
  }
  if (input.roles !== undefined) {
    await assertRolesExist(input.roles);
    service.set('roles', input.roles);
  }

  for (const field of ['name', 'description', 'icon', 'category', 'tab', 'url', 'status', 'visibility', 'config', 'order'] as const) {
    if (input[field] !== undefined) service.set(field, input[field]);
  }
  service.set('updatedBy', req.auth?.userId ?? null);
  await service.save();

  await recordActivity(req, {
    action: 'services.update',
    entity: 'Service',
    entityId: String(service._id),
    description: `Updated service ${service.name}`,
    meta: { fields: Object.keys(input) },
  });

  return getService(String(service._id));
}

export async function setServiceStatus(req: Request, id: string, status: ServiceStatus) {
  const service = await Service.findById(id);
  if (!service) throw ApiError.notFound('Service not found');

  service.set('status', status);
  service.set('updatedBy', req.auth?.userId ?? null);
  await service.save();

  await recordActivity(req, {
    action: 'services.toggle',
    entity: 'Service',
    entityId: String(service._id),
    description: `${status === 'enabled' ? 'Enabled' : 'Disabled'} service ${service.name}`,
  });

  return getService(String(service._id));
}

export async function deleteService(req: Request, id: string) {
  const service = await Service.findById(id);
  if (!service) throw ApiError.notFound('Service not found');

  // Options attached to this service would be orphaned; make the caller decide.
  const { ApplicationOption } = await import('../models/ApplicationOption.js');
  const attached = await ApplicationOption.countDocuments({ service: service._id });
  if (attached > 0) {
    throw ApiError.conflict(`${attached} application option(s) reference this service. Remove or reassign them first.`);
  }

  await service.deleteOne();
  await recordActivity(req, {
    action: 'services.delete',
    entity: 'Service',
    entityId: id,
    description: `Deleted service ${service.name}`,
  });
}

async function assertRolesExist(roles?: string[]): Promise<void> {
  if (!roles || roles.length === 0) return;
  const found = await Role.countDocuments({ _id: { $in: roles } });
  if (found !== new Set(roles).size) {
    throw ApiError.badRequest('One or more roles do not exist', { field: 'roles' });
  }
}
