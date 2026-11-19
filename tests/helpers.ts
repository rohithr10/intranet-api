import mongoose from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { ApplicationOption } from '../src/models/ApplicationOption.js';
import { Content } from '../src/models/Content.js';
import { Media } from '../src/models/Media.js';
import { News } from '../src/models/News.js';
import { Permission } from '../src/models/Permission.js';
import { Role } from '../src/models/Role.js';
import { Service } from '../src/models/Service.js';
import { Tag } from '../src/models/Tag.js';
import { User, hashPassword } from '../src/models/User.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { PERMISSION_CATALOG } from '../src/utils/permissions.js';
import { SEED_ROLES } from '../src/seed/roles.js';

export const PASSWORD = 'TestPassword123';

let app: Express | null = null;

export async function setupTestApp(): Promise<Express> {
  await connectDatabase();
  app ??= createApp();
  return app;
}

export async function teardownTestApp(): Promise<void> {
  await disconnectDatabase();
}

/** Clears every collection, then re-seeds permissions and the system roles. */
export async function resetDatabase(): Promise<void> {
  await Promise.all(
    [ActivityLog, ApplicationOption, Content, Media, News, Permission, Role, Service, Tag, User].map((model) =>
      model.deleteMany({}),
    ),
  );

  await Permission.insertMany(PERMISSION_CATALOG.map((permission) => ({ ...permission })));
  await Role.insertMany(SEED_ROLES.map((role) => ({ ...role, isSystem: true })));
}

export async function roleId(key: string): Promise<string> {
  const role = await Role.findOne({ key }).select('_id').lean();
  if (!role) throw new Error(`Seed role "${key}" is missing`);
  return String(role._id);
}

export interface TestUser {
  id: string;
  email: string;
  roleKey: string;
}

/** Creates an active account with the given system role. */
export async function createUser(options: {
  email: string;
  roleKey: string;
  name?: string;
  status?: 'active' | 'inactive' | 'suspended';
  password?: string;
}): Promise<TestUser> {
  const user = await User.create({
    name: options.name ?? options.email.split('@')[0],
    email: options.email,
    passwordHash: await hashPassword(options.password ?? PASSWORD),
    role: await roleId(options.roleKey),
    status: options.status ?? 'active',
  });
  return { id: String(user._id), email: user.email, roleKey: options.roleKey };
}

export interface Session {
  /** Cookie-bearing agent; use `.set('X-CSRF-Token', csrf)` on writes. */
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  user: Record<string, unknown>;
}

/** Signs in and returns an agent that carries the session cookies. */
export async function signIn(app: Express, email: string, password = PASSWORD): Promise<Session> {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password }).expect(200);

  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  const csrfCookie = (cookies ?? []).find((cookie) => cookie.startsWith('csrf_token='));
  const csrf = csrfCookie?.split(';')[0]?.split('=')[1] ?? '';

  return { agent, csrf, user: response.body.data.user as Record<string, unknown> };
}

/** Convenience wrappers that attach the CSRF header automatically. */
export function post(session: Session, path: string, body?: unknown) {
  return session.agent.post(path).set('X-CSRF-Token', session.csrf).send(body as object);
}
export function put(session: Session, path: string, body?: unknown) {
  return session.agent.put(path).set('X-CSRF-Token', session.csrf).send(body as object);
}
export function patch(session: Session, path: string, body?: unknown) {
  return session.agent.patch(path).set('X-CSRF-Token', session.csrf).send(body as object);
}
export function del(session: Session, path: string) {
  return session.agent.delete(path).set('X-CSRF-Token', session.csrf);
}

export { mongoose };
