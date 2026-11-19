/* eslint-disable no-console */
import { env } from '../config/environment.js';

function stamp(): string {
  return new Date().toISOString();
}

/** Minimal structured logger — swap for pino/winston without touching callers. */
export const logger = {
  info(message: string, meta?: unknown) {
    if (env.isTest) return;
    console.log(`[${stamp()}] INFO  ${message}`, meta ?? '');
  },
  warn(message: string, meta?: unknown) {
    if (env.isTest) return;
    console.warn(`[${stamp()}] WARN  ${message}`, meta ?? '');
  },
  error(message: string, error?: unknown) {
    console.error(`[${stamp()}] ERROR ${message}`, error ?? '');
  },
};
