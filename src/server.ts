import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/environment.js';
import { ensureStorageReady } from './utils/storage.js';
import { logger } from './utils/logger.js';

async function start(): Promise<void> {
  await connectDatabase();
  await ensureStorageReady();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`API listening on http://127.0.0.1:${env.port} (${env.nodeEnv})`);
  });

  // listen() reports failures as an event, not a rejection, so without this a
  // busy port surfaces as a bare unhandled EADDRINUSE stack trace.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        `Port ${env.port} is already in use — another server is running.\n` +
          `  • Find it:  lsof -nP -iTCP:${env.port} -sTCP:LISTEN\n` +
          `  • Or use a different port:  PORT=4001 npm run dev`,
      );
    } else if (err.code === 'EACCES') {
      logger.error(`Not allowed to bind port ${env.port}. Ports below 1024 need elevated privileges.`);
    } else {
      logger.error('Server failed to start', err);
    }
    process.exit(1);
  });

  // Finish in-flight requests before the process goes away.
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', reason));
}

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
