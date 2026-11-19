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
