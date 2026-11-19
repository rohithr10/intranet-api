import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Every configurable value lives here. Nothing elsewhere reads process.env, so
 * a missing or malformed setting fails loudly at boot instead of at the first
 * request that happens to need it.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://127.0.0.1:5173,http://localhost:5173'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_URI_TEST: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  SUPER_ADMIN_NAME: z.string().default('Super Admin'),
  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(10).optional(),

  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('uploads'),
  PUBLIC_BASE_URL: z.string().default('http://127.0.0.1:4000'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().max(100).default(8),
});

/**
 * Values pasted into a hosting dashboard routinely carry a trailing newline or
 * space, which turns a correct setting into an enum or URI that fails to parse
 * (or, worse, a Mongo URI that fails to connect). Leading and trailing
 * whitespace is never meaningful for anything configured here — except a
 * password, where it could be deliberate and silently trimming it would lock
 * the account out.
 */
const source = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) =>
    typeof value === 'string' && key !== 'SUPER_ADMIN_PASSWORD' ? [key, value.trim()] : [key, value],
  ),
);

const parsed = schema.safeParse(source);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  process.exit(1);
}

const raw = parsed.data;
const isTest = raw.NODE_ENV === 'test';

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest,
  port: raw.PORT,
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  mongoUri: isTest ? (raw.MONGODB_URI_TEST ?? `${raw.MONGODB_URI}_test`) : raw.MONGODB_URI,

  jwt: {
    accessSecret: raw.JWT_ACCESS_SECRET,
    refreshSecret: raw.JWT_REFRESH_SECRET,
    accessTtl: raw.ACCESS_TOKEN_TTL,
    refreshTtl: raw.REFRESH_TOKEN_TTL,
  },
  cookie: {
    domain: raw.COOKIE_DOMAIN || undefined,
    secure: raw.COOKIE_SECURE,
    sameSite: raw.COOKIE_SAMESITE,
  },
  bcryptRounds: isTest ? 4 : raw.BCRYPT_ROUNDS,

  superAdmin: {
    name: raw.SUPER_ADMIN_NAME,
    email: raw.SUPER_ADMIN_EMAIL,
    password: raw.SUPER_ADMIN_PASSWORD,
  },

  storage: {
    driver: raw.STORAGE_DRIVER,
    localDir: path.resolve(process.cwd(), raw.STORAGE_LOCAL_DIR),
    publicBaseUrl: raw.PUBLIC_BASE_URL.replace(/\/$/, ''),
    maxUploadBytes: raw.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  },

  /** Stack traces are helpful locally and an information leak in production. */
  exposeErrorStack: raw.NODE_ENV === 'development',
} as const;

export type Env = typeof env;
