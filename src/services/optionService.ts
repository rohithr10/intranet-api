import type { Request } from 'express';
import { ApplicationOption } from '../models/ApplicationOption.js';
import { Service } from '../models/Service.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/sanitize.js';
import { recordActivity } from './activityService.js';
import type { ActiveStatus, AuthContext, OptionType } from '../types/domain.js';

/**
 * Keys that look like credentials are refused outright. Secrets belong in
 * environment variables; an options table that an admin UI can read is the
 * wrong place for them, and `isPublic` would expose them to every visitor.
 */
const FORBIDDEN_KEY_PATTERN = /(password|passwd|secret|private[_.-]?key|api[_.-]?key|token|credential|connection[_.-]?string|mongodb_uri|dsn)/i;

function assertKeyIsNotSensitive(key: string): void {
  if (FORBIDDEN_KEY_PATTERN.test(key)) {
    throw ApiError.badRequest(
      'Option keys must not hold credentials or secrets — use server environment variables instead',
      { field: 'key', code: 'SENSITIVE_KEY' },
    );
  }
}

export interface OptionListQuery {
  page: number;
  limit: number;
  search?: string;
  module?: string;
  type?: OptionType;
  status?: ActiveStatus;
}

export async function listOptions(query: OptionListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.module) filter.module = query.module;
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const needle = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: needle }, { key: needle }, { description: needle }];
  }

  const [items, total] = await Promise.all([
    ApplicationOption.find(filter)
      .populate('service', 'name key')
      .sort({ module: 1, name: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    ApplicationOption.countDocuments(filter),
  ]);

  return { items, total };
}

export async function getOption(id: string) {
  const option = await ApplicationOption.findById(id).populate('service', 'name key').lean();
  if (!option) throw ApiError.notFound('Option not found');
  return option;
}

/**
 * Flat `{ key: value }` map the frontend consumes. Public callers only ever see
 * options explicitly marked `isPublic`.
 */
export async function getEffectiveOptions(auth?: AuthContext): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = { status: 'active' };
  if (!auth) filter.isPublic = true;

  const options = await ApplicationOption.find(filter).select('key value defaultValue type').lean();
  const map: Record<string, unknown> = {};
  for (const option of options) {
    map[option.key] = option.value ?? option.defaultValue ?? null;
  }
  return map;
}

export interface OptionInput {
  name: string;
  key: string;
  description?: string;
  type: OptionType;
  defaultValue?: unknown;
  value?: unknown;
  choices?: { label: string; value: string }[];
  validation?: { min?: number | null; max?: number | null; pattern?: string | null; required?: boolean };
  module?: string;
  service?: string | null;
  editPermission?: string | null;
  isPublic?: boolean;
  status?: ActiveStatus;
}

export async function createOption(req: Request, input: OptionInput) {
  const key = input.key.trim().toLowerCase();
  assertKeyIsNotSensitive(key);
  if (await ApplicationOption.exists({ key })) {
    throw ApiError.conflict('An option with that key already exists', { field: 'key' });
  }
  if (input.service) await assertServiceExists(input.service);

  const value = input.value !== undefined ? input.value : (input.defaultValue ?? null);
  validateOptionValue({ ...input, key }, value);

  const option = await ApplicationOption.create({
    ...input,
    key,
    value,
    updatedBy: req.auth?.userId ?? null,
  });

  await recordActivity(req, {
    action: 'options.create',
    entity: 'ApplicationOption',
    entityId: String(option._id),
    description: `Created option ${option.key}`,
  });

  return getOption(String(option._id));
}

export async function updateOption(req: Request, id: string, input: Partial<OptionInput>) {
  const option = await ApplicationOption.findById(id);
  if (!option) throw ApiError.notFound('Option not found');

  // An option may demand a permission of its own beyond options.edit.
  const gate = option.editPermission;
  if (gate && !req.auth?.isSuperAdmin && !req.auth?.permissions.has(gate)) {
    throw ApiError.forbidden(`Changing this option requires the "${gate}" permission`);
  }

  if (input.key !== undefined) {
    const key = input.key.trim().toLowerCase();
    assertKeyIsNotSensitive(key);
    if (key !== option.key && (await ApplicationOption.exists({ key }))) {
      throw ApiError.conflict('An option with that key already exists', { field: 'key' });
    }
    option.set('key', key);
  }
  if (input.service !== undefined) {
    if (input.service) await assertServiceExists(input.service);
    option.set('service', input.service || null);
  }

  for (const field of ['name', 'description', 'type', 'defaultValue', 'choices', 'validation', 'module', 'editPermission', 'isPublic', 'status'] as const) {
    if (input[field] !== undefined) option.set(field, input[field]);
  }

  if (input.value !== undefined) {
    validateOptionValue(
      {
        key: option.key,
        type: option.type as OptionType,
        choices: option.choices as { label: string; value: string }[],
        validation: option.validation as OptionInput['validation'],
      },
      input.value,
    );
    option.set('value', input.value);
  }

  option.set('updatedBy', req.auth?.userId ?? null);
  await option.save();

  await recordActivity(req, {
    action: 'options.update',
    entity: 'ApplicationOption',
    entityId: String(option._id),
    description: `Updated option ${option.key}`,
    meta: { fields: Object.keys(input) },
  });

  return getOption(String(option._id));
}

export async function deleteOption(req: Request, id: string) {
  const option = await ApplicationOption.findById(id);
  if (!option) throw ApiError.notFound('Option not found');
  await option.deleteOne();
  await recordActivity(req, {
    action: 'options.delete',
    entity: 'ApplicationOption',
    entityId: id,
    description: `Deleted option ${option.key}`,
  });
}

/** Enforces the option's declared type and its own validation rules. */
export function validateOptionValue(
  option: { key: string; type: OptionType; choices?: { label: string; value: string }[]; validation?: OptionInput['validation'] },
  value: unknown,
): void {
  const { type, validation } = option;
  const field = 'value';

  if (value === null || value === undefined) {
    if (validation?.required) throw ApiError.unprocessable(`${option.key} requires a value`, { field });
    return;
  }

  switch (type) {
    case 'boolean':
      if (typeof value !== 'boolean') throw ApiError.unprocessable(`${option.key} must be true or false`, { field });
      break;
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw ApiError.unprocessable(`${option.key} must be a number`, { field });
      }
      if (validation?.min != null && value < validation.min) {
        throw ApiError.unprocessable(`${option.key} must be at least ${validation.min}`, { field });
      }
      if (validation?.max != null && value > validation.max) {
        throw ApiError.unprocessable(`${option.key} must be at most ${validation.max}`, { field });
      }
      break;
    }
    case 'text': {
      if (typeof value !== 'string') throw ApiError.unprocessable(`${option.key} must be text`, { field });
      if (validation?.min != null && value.length < validation.min) {
        throw ApiError.unprocessable(`${option.key} must be at least ${validation.min} characters`, { field });
      }
      if (validation?.max != null && value.length > validation.max) {
        throw ApiError.unprocessable(`${option.key} must be at most ${validation.max} characters`, { field });
      }
      if (validation?.pattern) {
        let pattern: RegExp;
        try {
          pattern = new RegExp(validation.pattern);
        } catch {
          throw ApiError.badRequest(`${option.key} has an invalid validation pattern`, { field: 'validation.pattern' });
        }
        if (!pattern.test(value)) {
          throw ApiError.unprocessable(`${option.key} does not match the required format`, { field });
        }
      }
      break;
    }
    case 'select': {
      const allowed = (option.choices ?? []).map((c) => c.value);
      if (typeof value !== 'string' || !allowed.includes(value)) {
        throw ApiError.unprocessable(`${option.key} must be one of: ${allowed.join(', ')}`, { field });
      }
      break;
    }
    case 'multiselect': {
      const allowed = (option.choices ?? []).map((c) => c.value);
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !allowed.includes(v))) {
        throw ApiError.unprocessable(`${option.key} must be a subset of: ${allowed.join(', ')}`, { field });
      }
      break;
    }
    case 'json': {
      if (typeof value !== 'object') throw ApiError.unprocessable(`${option.key} must be a JSON object or array`, { field });
      break;
    }
    default:
      throw ApiError.badRequest(`Unsupported option type: ${String(type)}`);
  }
}

async function assertServiceExists(id: string): Promise<void> {
  if (!(await Service.exists({ _id: id }))) {
    throw ApiError.badRequest('Service not found', { field: 'service' });
  }
}
