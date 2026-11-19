import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/environment.js';
import { ApplicationOption } from '../models/ApplicationOption.js';
import { Content } from '../models/Content.js';
import { Media } from '../models/Media.js';
import { News } from '../models/News.js';
import { Permission } from '../models/Permission.js';
import { Role } from '../models/Role.js';
import { Service } from '../models/Service.js';
import { Tag } from '../models/Tag.js';
import { User, hashPassword } from '../models/User.js';
import { PERMISSION_CATALOG } from '../utils/permissions.js';
import { slugify } from '../utils/slug.js';
import { storage } from '../utils/storage.js';
import { logger } from '../utils/logger.js';
import { SEED_ROLES } from './roles.js';
import {
  DEMO_COUNTRIES,
  DEMO_DOCUMENT_PARTS,
  DEMO_FOLDERS,
  DEMO_NEWS,
  DEMO_OPTIONS,
  DEMO_PEOPLE,
  DEMO_SERVICES,
} from './demoData.js';

/* eslint-disable no-console */

/**
 * Idempotent seed. Running it twice changes nothing the second time, so it is
 * safe on an existing database:
 *
 *   npm run seed         → permissions, roles, super admin, portal options
 *   npm run seed:demo    → the above plus the portal's original demo content
 */
async function main(): Promise<void> {
  const demo = process.argv.includes('--demo');
  await connectDatabase();

  console.log('\n─── Seeding Urbaser Connect ───');

  await seedPermissions();
  const roles = await seedRoles();
  const superAdmin = await seedSuperAdmin(roles.get('super-admin'));
  await seedOptions(superAdmin?.id);

  if (demo) {
    if (!superAdmin) {
      throw new Error('Demo content needs an author — set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env');
    }
    await seedServices(superAdmin.id, roles);
    const tags = await seedTags(superAdmin.id);
    await seedNews(superAdmin.id, tags);
    await seedDocuments(superAdmin.id);
    await seedDirectoryPeople(roles.get('viewer'));
  }

  console.log('─── Done ───\n');
  await disconnectDatabase();
}

async function seedPermissions(): Promise<void> {
  const operations = PERMISSION_CATALOG.map((permission) => ({
    updateOne: {
      filter: { key: permission.key },
      update: { $set: permission },
      upsert: true,
    },
  }));
  const result = await Permission.bulkWrite(operations);
  console.log(`  permissions   ${PERMISSION_CATALOG.length} in catalog (${result.upsertedCount} new)`);
}

async function seedRoles(): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  let created = 0;

  for (const role of SEED_ROLES) {
    const existing = await Role.findOne({ key: role.key });
    if (existing) {
      // Preserve any permission changes an administrator has made, but keep the
      // super admin role at "everything" and the descriptions current.
      existing.set('name', role.name);
      existing.set('description', role.description);
      existing.set('isSystem', true);
      existing.set('isSuperAdmin', role.isSuperAdmin);
      if (existing.permissions.length === 0 && !role.isSuperAdmin) {
        existing.set('permissions', role.permissions);
      }
      await existing.save();
      byKey.set(role.key, String(existing._id));
      continue;
    }

    const doc = await Role.create({ ...role, isSystem: true });
    byKey.set(role.key, String(doc._id));
    created += 1;
  }

  console.log(`  roles         ${SEED_ROLES.length} system roles (${created} new)`);
  return byKey;
}

async function seedSuperAdmin(roleId?: string): Promise<{ id: string; email: string } | null> {
  const { email, password, name } = env.superAdmin;

  if (!roleId) throw new Error('Super admin role missing — seedRoles must run first');
  if (!email || !password) {
    console.log('  super admin   skipped (set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env)');
    return null;
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    if (process.argv.includes('--reset-admin')) {
      existing.set('passwordHash', await hashPassword(password));
      existing.set('status', 'active');
      await existing.save();
      console.log(`  super admin   password updated for ${email} from .env`);
      return { id: String(existing._id), email: existing.email };
    }
    // Never silently reset the password of an account already in use.
    console.log(`  super admin   already exists (${email}) — password left unchanged (run npm run seed:reset to update password)`);
    return { id: String(existing._id), email: existing.email };
  }

  const created = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    role: roleId,
    status: 'active',
    department: 'Administration',
    showInDirectory: false,
  });

  console.log(`  super admin   created ${email}`);
  console.log('                sign in with the SUPER_ADMIN_PASSWORD from your .env file');
  return { id: String(created._id), email: created.email };
}

async function seedOptions(updatedBy?: string): Promise<void> {
  let created = 0;
  for (const option of DEMO_OPTIONS) {
    const existing = await ApplicationOption.findOne({ key: option.key });
    if (existing) continue;
    await ApplicationOption.create({
      ...option,
      // An option starts at its default; the admin UI edits `value`.
      value: option.defaultValue,
      status: 'active',
      updatedBy: updatedBy ?? null,
    });
    created += 1;
  }
  console.log(`  options       ${DEMO_OPTIONS.length} portal options (${created} new)`);
}

async function seedServices(createdBy: string, roles: Map<string, string>): Promise<void> {
  let created = 0;
  for (const [index, service] of DEMO_SERVICES.entries()) {
    const existing = await Service.findOne({ key: service.key });
    if (existing) continue;
    await Service.create({
      ...service,
      status: 'enabled',
      // The employee portal tab is for signed-in staff; general tools are open.
      visibility: service.tab === 'EMPLOYEE PORTAL' ? 'authenticated' : 'public',
      roles: [],
      order: index,
      createdBy,
      updatedBy: createdBy,
    });
    created += 1;
  }
  void roles;
  console.log(`  services      ${DEMO_SERVICES.length} services (${created} new)`);
}

async function seedTags(createdBy: string): Promise<Map<string, string>> {
  const names = [...new Set(DEMO_NEWS.flatMap((article) => article.tags))];
  const palette = ['#a3e635', '#38bdf8', '#f472b6', '#fbbf24', '#34d399', '#c084fc', '#fb7185'];
  const byName = new Map<string, string>();
  let created = 0;

  for (const [index, name] of names.entries()) {
    const slug = slugify(name);
    const existing = await Tag.findOne({ slug });
    if (existing) {
      byName.set(name, String(existing._id));
      continue;
    }
    const tag = await Tag.create({
      name,
      slug,
      color: palette[index % palette.length],
      status: 'active',
      createdBy,
    });
    byName.set(name, String(tag._id));
    created += 1;
  }

  console.log(`  tags          ${names.length} tags (${created} new)`);
  return byName;
}

/**
 * Registers the demo artwork as managed media.
 *
 * The files ship in seed-assets/ and are copied into the configured storage
 * directory, so from here on the images are library items an administrator can
 * replace — not files baked into a build. Set SEED_ASSETS_DIR to load them from
 * somewhere else.
 */
async function seedNewsImage(filename: string, uploadedBy: string): Promise<string | null> {
  const existing = await Media.findOne({ originalName: filename });
  if (existing) return String(existing._id);

  const assetsDir = process.env.SEED_ASSETS_DIR
    ? path.resolve(process.env.SEED_ASSETS_DIR)
    : path.resolve(process.cwd(), 'seed-assets');
  const source = path.join(assetsDir, filename);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(source);
  } catch {
    logger.warn(`Seed artwork not found, skipping: ${source}`);
    return null;
  }

  const stored = await storage.save(buffer, filename);
  const media = await Media.create({
    filename: stored.storageKey.split('/').pop() ?? filename,
    originalName: filename,
    mimeType: 'image/png',
    size: stored.size,
    storageKey: stored.storageKey,
    url: stored.url,
    alt: '',
    folder: 'news',
    uploadedBy,
  });
  return String(media._id);
}

async function seedNews(authorId: string, tags: Map<string, string>): Promise<void> {
  let created = 0;

  for (const article of DEMO_NEWS) {
    const slug = slugify(article.title);
    if (await News.exists({ slug })) continue;

    const imageId = await seedNewsImage(article.image, authorId);
    const publishedAt = new Date(`${article.date}T09:00:00.000Z`);

    await News.create({
      title: article.title,
      slug,
      summary: `${article.scope} news from the ${article.category.toLowerCase()} team.`,
      body:
        `<p>${article.title}.</p>` +
        `<p>This article was created by the seed script so the portal has real, editable content on a ` +
        `fresh install. Open News Management in the admin dashboard to rewrite it, change its tags, ` +
        `schedule it or take it offline.</p>`,
      featuredImage: imageId,
      category: article.category,
      scope: article.scope,
      tags: article.tags.map((name) => tags.get(name)).filter(Boolean),
      author: authorId,
      status: 'published',
      publishedAt,
      seoTitle: article.title,
      seoDescription: `${article.title} — Urbaser Connect`,
      isFeatured: created === 0,
      updatedBy: authorId,
    });
    created += 1;
  }

  console.log(`  news          ${DEMO_NEWS.length} articles (${created} new)`);
}

async function seedDocuments(authorId: string): Promise<void> {
  let created = 0;

  for (const country of DEMO_COUNTRIES) {
    for (const [index, folder] of DEMO_FOLDERS.entries()) {
      for (const part of DEMO_DOCUMENT_PARTS) {
        const title = `${folder} — ${part}`;
        const slug = slugify(`${country}-${title}`);
        if (await Content.exists({ slug })) continue;

        await Content.create({
          title,
          slug,
          summary: `${part} for ${folder} (${country}).`,
          body: `<p>${title}</p><p>Managed document content for ${country}. Edit it in Content Management.</p>`,
          category: folder,
          country,
          author: authorId,
          status: 'published',
          publishedAt: new Date('2026-06-05T00:00:00.000Z'),
          order: index,
          updatedBy: authorId,
        });
        created += 1;
      }
    }
  }

  console.log(`  documents     ${DEMO_COUNTRIES.length * DEMO_FOLDERS.length * DEMO_DOCUMENT_PARTS.length} documents (${created} new)`);
}

/**
 * The people behind the portal's directory. Each gets a random password and
 * `mustChangePassword`, so a seeded account cannot be signed into with a
 * password anyone could guess from this repository.
 */
async function seedDirectoryPeople(roleId?: string): Promise<void> {
  if (!roleId) return;
  let created = 0;

  for (const person of DEMO_PEOPLE) {
    if (await User.exists({ email: person.email })) continue;
    await User.create({
      ...person,
      passwordHash: await hashPassword(`${crypto.randomBytes(18).toString('base64url')}Aa1`),
      role: roleId,
      status: 'active',
      showInDirectory: true,
      mustChangePassword: true,
    });
    created += 1;
  }

  console.log(`  directory     ${DEMO_PEOPLE.length} people (${created} new)`);
}

main().catch((err) => {
  logger.error('Seed failed', err);
  process.exit(1);
});
