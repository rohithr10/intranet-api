# Urbaser Connect — Intranet API

Express + TypeScript + MongoDB backend for the Urbaser Connect employee intranet:
JWT authentication over httpOnly cookies, permission-based access control, and
management of services, application options, content, news, tags, media and audit
logs.

The frontend is a separate React application and deploys independently. This
service only needs to know which origins may call it (`CORS_ORIGINS`).

```
src/
├── config/       Environment validation, database connection
├── models/       10 Mongoose models
├── services/     Business logic
├── controllers/  HTTP handlers
├── routes/       Routes with their permission guards
├── middleware/   Auth, RBAC, CSRF, validation, errors, rate limits
├── validators/   Zod request schemas
├── utils/        JWT, cookies, storage driver, permission catalog
└── seed/         Permissions, roles, super admin, demo content
tests/            100 integration tests (Vitest + Supertest)
seed-assets/      Demo artwork used by `npm run seed:demo`
```

## Requirements

- Node.js 20.19+ or 22.12+
- MongoDB 6+ (local, Atlas, or any reachable URI)

## Local development

```sh
npm install
cp .env.example .env
```

Set at least `MONGODB_URI`, both JWT secrets and the super admin credentials in
`.env`. Generate each secret with:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then seed and run:

```sh
npm run seed          # permissions, 5 system roles, super admin, portal options
npm run seed:demo     # the above plus demo services, news, documents and people
npm run dev           # http://127.0.0.1:4000
```

Both seed commands are idempotent, and neither resets an existing
administrator's password.

```sh
npm test              # 100 integration tests against MONGODB_URI_TEST
npm run typecheck
npm run build && npm start
```

## Deploying to Render

### 1. MongoDB

Create a free MongoDB Atlas cluster, add a database user, and allow network
access from Render. Render's non-static-IP plans mean allow-listing `0.0.0.0/0`
— the database user and password remain the real access control, so use a strong
one and give it `readWrite` on this one database only.

### 2. The service

Either commit `render.yaml` and use **New → Blueprint**, or create a Web Service
by hand with:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci && npm run build` |
| Start command | `node dist/server.js` |
| Health check path | `/api/health` |

Environment variables:

```ini
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/intranet
JWT_ACCESS_SECRET=<48 random bytes>
JWT_REFRESH_SECRET=<48 random bytes, different>
CORS_ORIGINS=https://your-app.vercel.app
PUBLIC_BASE_URL=https://intranet-api.onrender.com
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
STORAGE_LOCAL_DIR=/var/data/uploads
```

`PORT` is provided by Render and read automatically.

### 3. Connecting the frontend

Authentication is a cookie, which is what makes the frontend's origin matter.
Two arrangements work:

**Same site (preferred).** Frontend on `app.example.com`, this API on
`api.example.com`. Different origins, same site, so a normal `SameSite=Lax`
cookie is sent and nothing is treated as third-party.

```ini
CORS_ORIGINS=https://app.example.com
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=.example.com
```

The frontend is built with `VITE_API_BASE_URL=https://api.example.com`.

**Proxied.** The frontend keeps `VITE_API_BASE_URL` empty and rewrites `/api/*`
to this service, so the browser only sees one origin. On Vercel:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://intranet-api.onrender.com/api/:path*" }
  ]
}
```

Keep `COOKIE_SAMESITE=lax`, and note that Vercel's proxy caps request bodies at
roughly 4.5 MB, so set `MAX_UPLOAD_SIZE_MB=4`. Leave `PUBLIC_BASE_URL` pointing
at this service so images are served directly rather than through the proxy.

**Cross-site** (a `*.vercel.app` page calling an `*.onrender.com` API) needs
`COOKIE_SAMESITE=none` with `COOKIE_SECURE=true`. It works today, but browsers
are restricting third-party cookies, so prefer one of the two above.

### 4. Seed the first administrator

Once, from Render's shell, with `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`
set in the environment:

```sh
npm run seed:prod
```

Then delete those two variables. Re-run it after an upgrade that adds
permissions; it will add the new ones and leave everything else alone.

## Media storage

Uploads are written through a storage driver and only their metadata is stored
in MongoDB. The default driver writes to `STORAGE_LOCAL_DIR`.

**Render's filesystem is ephemeral.** Without a persistent disk, every uploaded
file disappears on the next deploy and the Media Library is left pointing at
nothing. Either:

- attach a Render disk (paid plans) and set `STORAGE_LOCAL_DIR` to its mount
  path — `render.yaml` already does this; or
- implement an object-storage driver. `StorageDriver` in
  [src/utils/storage.ts](src/utils/storage.ts) is three methods (`save`,
  `remove`, `urlFor`), so an S3 or Cloudflare R2 driver is a single file and two
  environment variables.

Note that a disk pins the service to one instance and disables zero-downtime
deploys; object storage avoids both limits.

## Docker

```sh
docker build -t intranet-api .
docker run -p 4000:4000 --env-file .env -v intranet-uploads:/var/data/uploads intranet-api
```

The image runs as a non-root user, contains no dev dependencies, and runs the
compiled entry point directly so `SIGTERM` reaches Node and the graceful
shutdown runs.

## Security notes

- Secrets live in environment variables only. Application Options refuses any
  key that looks like a credential, so configuration cannot become a secret
  store.
- Permissions are re-read from the database on every request rather than trusted
  from the token, so revoking access takes effect immediately. Changing a role
  bumps the token version of its users, forcing re-authentication.
- Cookie-authenticated writes require a matching `X-CSRF-Token` header. Bearer
  clients are exempt, since nothing is attached automatically for them.
- Public endpoints only ever return published content. Drafts, scheduled items
  and disabled services are filtered server-side.
- The rate limiters keep their counters in process memory. Move them to a shared
  store (Redis) before running more than one instance.

See [API.md](API.md) for the full endpoint reference.
