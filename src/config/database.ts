import mongoose from 'mongoose';
import { env } from './environment.js';
import { logger } from '../utils/logger.js';

let connecting: Promise<typeof mongoose> | null = null;

/** Connects once; repeated calls reuse the same connection (tests call it too). */
export async function connectDatabase(uri: string = env.mongoUri): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  mongoose.set('strictQuery', true);
  // NoSQL-injection defence lives in the `sanitizeMongo` middleware and the zod
  // schemas, which scrub `$`-prefixed and dotted keys out of request input.
  // Mongoose's global `sanitizeFilter` is deliberately not used: it would also
  // neutralise the operator queries this server builds itself (date ranges,
  // `$in`, `$or`), turning them into literal equality checks.

  connecting = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });

  try {
    await connecting;
    logger.info(`MongoDB connected → ${redact(uri)}`);
    return mongoose;
  } finally {
    connecting = null;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

function redact(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}
