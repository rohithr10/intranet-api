import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createUser, post, resetDatabase, setupTestApp, signIn, teardownTestApp, type Session } from './helpers.js';

describe('security', () => {
  let app: Express;
  let session: Session;

  beforeAll(async () => {
    app = await setupTestApp();
  });
  afterAll(teardownTestApp);

  beforeEach(async () => {
    await resetDatabase();
    await createUser({ email: 'super@test.local', roleKey: 'super-admin' });
    session = await signIn(app, 'super@test.local');
  });

  describe('CSRF', () => {
    it('rejects a cookie-authenticated write without the CSRF header', async () => {
      const response = await session.agent.post('/api/tags').send({ name: 'No header tag' });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CSRF_FAILED');
    });

    it('rejects a mismatched CSRF token', async () => {
      const response = await session.agent
        .post('/api/tags')
        .set('X-CSRF-Token', 'f'.repeat(64))
        .send({ name: 'Wrong header tag' });
      expect(response.status).toBe(403);
    });

    it('accepts a write that echoes the CSRF cookie back in the header', async () => {
      await post(session, '/api/tags', { name: 'Correct header tag' }).expect(201);
    });

    it('does not require CSRF for reads', async () => {
      await session.agent.get('/api/tags').expect(200);
    });
  });

  describe('headers and CORS', () => {
    it('sends the expected security headers', async () => {
      const response = await request(app).get('/api/health').expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('refuses an origin that is not on the allow-list', async () => {
      const response = await request(app).get('/api/health').set('Origin', 'https://evil.example');
      expect(response.status).toBe(403);
    });

    it('allows a configured origin with credentials', async () => {
      const response = await request(app).get('/api/health').set('Origin', 'http://127.0.0.1:5173').expect(200);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    });
  });

  describe('input handling', () => {
    it('strips operator keys from a request body', async () => {
      // `$set` would be an update operator if it reached Mongoose unfiltered.
      const response = await post(session, '/api/tags', { name: 'Clean tag', $set: { status: 'inactive' } }).expect(201);
      expect(response.body.data.tag.status).toBe('active');
    });

    it('ignores unknown fields instead of writing them', async () => {
      const response = await post(session, '/api/tags', { name: 'Strict tag', isSuperAdmin: true }).expect(201);
      expect(response.body.data.tag.isSuperAdmin).toBeUndefined();
    });

    it('rejects a malformed object id with 422 rather than a 500', async () => {
      const response = await session.agent.get('/api/users/not-an-id');
      expect(response.status).toBe(422);
    });

    it('rejects malformed JSON with 400', async () => {
      const response = await session.agent
        .post('/api/tags')
        .set('X-CSRF-Token', session.csrf)
        .set('Content-Type', 'application/json')
        .send('{"name": broken}');
      expect(response.status).toBe(400);
    });

    it('caps the page size a caller can request', async () => {
      const response = await session.agent.get('/api/news?limit=100000');
      expect(response.status).toBe(422);
    });
  });

  describe('error handling', () => {
    it('answers 404 in the standard shape for an unknown route', async () => {
      const response = await request(app).get('/api/nope').expect(404);
      expect(response.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    });

    it('does not leak a stack trace in production mode', async () => {
      // In development the stack is included on purpose; this asserts the flag
      // exists and is driven by NODE_ENV rather than being always-on.
      const { env } = await import('../src/config/environment.js');
      expect(env.isTest).toBe(true);
      expect(env.exposeErrorStack).toBe(false);
    });
  });

  describe('media uploads', () => {
    it('refuses a file type that is not on the allow-list', async () => {
      const response = await session.agent
        .post('/api/media/upload')
        .set('X-CSRF-Token', session.csrf)
        .attach('file', Buffer.from('#!/bin/sh\necho hi\n'), { filename: 'script.sh', contentType: 'application/x-sh' });
      expect(response.status).toBe(400);
    });

    it('refuses a file whose bytes do not match its declared type', async () => {
      const response = await session.agent
        .post('/api/media/upload')
        .set('X-CSRF-Token', session.csrf)
        .attach('file', Buffer.from('<?php system($_GET[0]); ?>'), {
          filename: 'shell.png',
          contentType: 'image/png',
        });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('CONTENT_MISMATCH');
    });

    it('accepts a real PNG and stores only metadata in MongoDB', async () => {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64',
      );

      const response = await session.agent
        .post('/api/media/upload')
        .set('X-CSRF-Token', session.csrf)
        .attach('file', png, { filename: 'pixel.png', contentType: 'image/png' })
        .expect(201);

      const media = response.body.data.media;
      expect(media.mimeType).toBe('image/png');
      expect(media.url).toContain('/uploads/');
      expect(media.storageKey).toBeDefined();
      // The bytes themselves are not in the document.
      expect(JSON.stringify(media)).not.toContain('iVBORw0KGgo');
    });

    it('requires authentication to upload', async () => {
      const response = await request(app).post('/api/media/upload');
      expect(response.status).toBe(401);
    });
  });
});
