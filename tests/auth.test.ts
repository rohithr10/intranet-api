import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { User } from '../src/models/User.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import {
  PASSWORD,
  createUser,
  post,
  resetDatabase,
  setupTestApp,
  signIn,
  teardownTestApp,
} from './helpers.js';

describe('authentication', () => {
  let app: Express;

  beforeAll(async () => {
    app = await setupTestApp();
  });
  afterAll(teardownTestApp);
  beforeEach(async () => {
    await resetDatabase();
    await createUser({ email: 'admin@test.local', roleKey: 'super-admin', name: 'Test Admin' });
  });

  it('signs in with valid credentials and sets httpOnly session cookies', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: PASSWORD })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('admin@test.local');
    expect(response.body.data.user.permissions.length).toBeGreaterThan(30);

    const cookies = (response.headers['set-cookie'] as unknown as string[]) ?? [];
    const access = cookies.find((cookie) => cookie.startsWith('access_token='));
    const refresh = cookies.find((cookie) => cookie.startsWith('refresh_token='));
    const csrf = cookies.find((cookie) => cookie.startsWith('csrf_token='));

    expect(access).toContain('HttpOnly');
    expect(refresh).toContain('HttpOnly');
    // The CSRF cookie must be readable by the frontend to be echoed back.
    expect(csrf).toBeDefined();
    expect(csrf).not.toContain('HttpOnly');
  });

  it('never returns the password hash or token version', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: PASSWORD })
      .expect(200);

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('$2b$');
    expect(body).not.toContain('tokenVersion');
  });

  it('rejects a wrong password with 401 and the same message as an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'NotThePassword1' })
      .expect(401);
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: PASSWORD })
      .expect(401);

    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('records failed sign-in attempts in the audit log', async () => {
    await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'wrong-one-1A' }).expect(401);
    const entry = await ActivityLog.findOne({ action: 'auth.login.failed' }).lean();
    expect(entry).not.toBeNull();
    expect(entry?.status).toBe('failure');
  });

  it('rejects a malformed email before touching the database', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: PASSWORD }).expect(422);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('refuses an operator-injection payload instead of matching any user', async () => {
    // Without input scrubbing, { $ne: null } would match the first user.
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(response.status).toBe(422);
  });

  it('blocks sign-in for a deactivated account', async () => {
    await createUser({ email: 'inactive@test.local', roleKey: 'viewer', status: 'inactive' });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@test.local', password: PASSWORD })
      .expect(403);
    expect(response.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('keeps the session across requests and returns it from /auth/me', async () => {
    const session = await signIn(app, 'admin@test.local');
    const response = await session.agent.get('/api/auth/me').expect(200);
    expect(response.body.data.user.email).toBe('admin@test.local');
  });

  it('issues a new session from the refresh cookie', async () => {
    const session = await signIn(app, 'admin@test.local');
    const response = await post(session, '/api/auth/refresh').expect(200);
    expect(response.body.data.user.email).toBe('admin@test.local');
  });

  it('clears the session on logout, after which /auth/me is 401', async () => {
    const session = await signIn(app, 'admin@test.local');
    await post(session, '/api/auth/logout').expect(200);
    await session.agent.get('/api/auth/me').expect(401);
  });

  it('rejects an unauthenticated request to a protected endpoint with 401', async () => {
    const response = await request(app).get('/api/users').expect(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered token', async () => {
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token')
      .expect(401);
  });

  it('invalidates existing sessions when the token version is bumped', async () => {
    const session = await signIn(app, 'admin@test.local');
    await session.agent.get('/api/auth/me').expect(200);

    // This is what deactivating an account, changing a password or changing a
    // role does internally.
    await User.updateOne({ email: 'admin@test.local' }, { $inc: { tokenVersion: 1 } });

    const response = await session.agent.get('/api/auth/me').expect(401);
    expect(response.body.code).toBe('TOKEN_REVOKED');
  });

  it('lets a user change their own password and refuses a wrong current password', async () => {
    const session = await signIn(app, 'admin@test.local');

    await post(session, '/api/auth/change-password', {
      currentPassword: 'WrongCurrent1',
      newPassword: 'BrandNewPassword1',
    }).expect(400);

    await post(session, '/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'BrandNewPassword1',
    }).expect(200);

    await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: PASSWORD }).expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'BrandNewPassword1' })
      .expect(200);
  });

  it('rejects a weak new password', async () => {
    const session = await signIn(app, 'admin@test.local');
    await post(session, '/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'short',
    }).expect(422);
  });

  it('records forgot-password requests identically for known and unknown emails', async () => {
    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'admin@test.local' })
      .expect(200);
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@test.local' })
      .expect(200);

    expect(known.body.message).toBe(unknown.body.message);
    expect(known.body.data.delivery).toBe('admin');

    const stored = await User.findOne({ email: 'admin@test.local' }).lean();
    expect(stored?.passwordResetRequestedAt).not.toBeNull();
  });

  it('lets an authorized admin issue a one-time reset link and resets the user password', async () => {
    const member = await createUser({ email: 'member@test.local', roleKey: 'viewer', name: 'Team Member' });
    const adminSession = await signIn(app, 'admin@test.local');
    const memberSession = await signIn(app, 'member@test.local');

    const linkRes = await post(adminSession, `/api/users/${member.id}/reset-link`, {}).expect(200);
    const resetUrl = new URL(linkRes.body.data.resetUrl as string);
    const token = resetUrl.searchParams.get('token') ?? '';
    expect(token.length).toBeGreaterThan(20);

    // Raw token is never stored directly in MongoDB.
    const dbUser = await User.findById(member.id).select('+passwordResetTokenHash').lean();
    expect(dbUser?.passwordResetTokenHash).toBeDefined();
    expect(dbUser?.passwordResetTokenHash).not.toBe(token);

    // Completing the reset updates the password, invalidates prior sessions, and consumes the token.
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'ResetPassword123' })
      .expect(200);

    await memberSession.agent.get('/api/auth/me').expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'member@test.local', password: 'ResetPassword123' })
      .expect(200);

    // Token cannot be reused.
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'AnotherPassword123' })
      .expect(400);
  });
});
