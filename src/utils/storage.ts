import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/environment.js';
import { logger } from './logger.js';

export interface StoredFile {
  storageKey: string;
  url: string;
  size: number;
}

/**
 * Media storage abstraction. Binaries stay out of MongoDB — only metadata and
 * the storage key are persisted — so swapping the local driver for S3/Azure is
 * a matter of adding a driver here. Configure with STORAGE_DRIVER in .env.
 */
export interface StorageDriver {
  save(buffer: Buffer, originalName: string): Promise<StoredFile>;
  remove(storageKey: string): Promise<void>;
  urlFor(storageKey: string): string;
}

class LocalDiskDriver implements StorageDriver {
  constructor(private readonly baseDir: string, private readonly publicBaseUrl: string) {}

  async save(buffer: Buffer, originalName: string): Promise<StoredFile> {
    const ext = path.extname(originalName).toLowerCase().slice(0, 10);
    // Dated folders keep directory listings small; the random name means an
    // attacker cannot guess or overwrite another upload's path.
    const now = new Date();
    const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const name = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    const storageKey = `${folder}/${name}`;
    const target = path.join(this.baseDir, storageKey);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);

    return { storageKey, url: this.urlFor(storageKey), size: buffer.byteLength };
  }

  async remove(storageKey: string): Promise<void> {
    const target = path.join(this.baseDir, storageKey);
    // Defence in depth: never delete outside the configured upload root.
    if (!path.resolve(target).startsWith(path.resolve(this.baseDir))) {
      throw new Error('Refusing to delete outside the storage directory');
    }
    await fs.rm(target, { force: true });
  }

  urlFor(storageKey: string): string {
    return `${this.publicBaseUrl}/uploads/${storageKey}`;
  }
}

export const storage: StorageDriver = new LocalDiskDriver(
  env.storage.localDir,
  env.storage.publicBaseUrl,
);

export async function ensureStorageReady(): Promise<void> {
  if (env.storage.driver === 'local') {
    await fs.mkdir(env.storage.localDir, { recursive: true });
    logger.info(`Media storage (local) → ${env.storage.localDir}`);
  }
}
