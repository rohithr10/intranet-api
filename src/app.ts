import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/environment.js';
import routes from './routes/index.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { sanitizeMongo } from './middleware/sanitizeMongo.js';
import { ApiError } from './utils/ApiError.js';

export function createApp(): Express {
  const app = express();

  // Needed for correct req.ip (and therefore rate limiting) behind a proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Uploaded media is served from this origin and embedded by the SPA on
      // another port during development, so images must be cross-origin
      // readable while everything else stays locked down.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: env.isProduction ? undefined : false,
    }),
  );

  app.use(
    cors({
      // Cookie auth requires an explicit origin allow-list; `*` is not valid
      // with credentials, and reflecting any Origin would defeat the purpose.
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(ApiError.forbidden(`Origin ${origin} is not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitizeMongo);

  // Uploaded files. `index: false` and the default dotfile handling keep this
  // from turning into a directory browser.
  app.use(
    '/uploads',
    express.static(env.storage.localDir, {
      index: false,
      dotfiles: 'deny',
      maxAge: env.isProduction ? '7d' : 0,
      setHeaders(res) {
        // Never let an uploaded file be interpreted as something else.
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', env: env.nodeEnv, time: new Date().toISOString() } });
  });

  app.use('/api', apiLimiter, csrfProtection, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
