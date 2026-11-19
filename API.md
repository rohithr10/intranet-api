# API reference

Base URL: `/api`. All requests and responses are JSON unless noted.

## Response shape

Success:

```json
{ "success": true, "data": { ... }, "message": "optional" }
```

Failure:

```json
{ "success": false, "message": "Human-readable", "code": "MACHINE_CODE", "field": "email" }
```

Paginated `data`:

```json
{ "items": [], "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
```

| Status | Meaning |
| --- | --- |
| 400 | Malformed request, or a rejected value (e.g. a sensitive option key) |
| 401 | No session, or an expired/revoked token (`TOKEN_EXPIRED`, `TOKEN_REVOKED`) |
| 403 | Authenticated but not permitted, or a failed CSRF check (`CSRF_FAILED`) |
| 404 | Not found — also returned for a draft requested through a public endpoint |
| 409 | Conflict: duplicate key, or a delete blocked by references |
| 413 | Upload over the configured size limit |
| 422 | Request failed schema validation (`VALIDATION_ERROR`) |
| 429 | Rate limit reached |

## Authentication

The access token is sent as an httpOnly cookie, so a browser needs no token
handling. A `Bearer` header is also accepted for scripts and native clients.

Cookie clients must echo the readable `csrf_token` cookie in an `X-CSRF-Token`
header on every `POST`, `PUT`, `PATCH` and `DELETE`. Bearer clients are exempt.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | — | `{ email, password }`. Sets `access_token`, `refresh_token`, `csrf_token`. Rate limited per email and IP. |
| POST | `/auth/refresh` | refresh cookie | Issues a new access token. |
| POST | `/auth/logout` | — | Clears the cookies. |
| GET | `/auth/me` | session | The signed-in user and their permission list. |
| POST | `/auth/change-password` | session | `{ currentPassword, newPassword }`. Revokes all other sessions. |

Password hashes and token versions never appear in a response.

## Public endpoints

Readable without a session; a signed-in caller may see more (role-restricted
services, non-public options). Drafts, scheduled items, archived items and
disabled services are never returned.

| Method | Path | Query | Returns |
| --- | --- | --- | --- |
| GET | `/public/news` | `page`, `limit`, `search`, `scope`, `category`, `tag`, `featured` | Published articles plus the categories in use. `tag` accepts a slug or id. |
| GET | `/public/news/:slug` | — | One article plus up to three related articles sharing a tag. |
| GET | `/public/tags` | — | Tags used by published news, with counts. |
| GET | `/public/services` | `search` | Visible, enabled services and their tabs. |
| GET | `/public/documents` | `country`, `search` | Published content grouped into folders, plus the countries in use. |
| GET | `/public/content/:slug` | — | One published document. |
| GET | `/public/directory` | `search`, `field`, `limit` | People directory. `field` is `name`, `department` or `country`. No email addresses. |
| GET | `/public/options` | — | `{ key: value }` of public application options. |
| GET | `/health` | — | Liveness check. |

## Dashboard

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/dashboard/stats` | `dashboard.view` |
| GET | `/dashboard/activity` | `audit.view` |

`/dashboard/activity` accepts `page`, `limit`, `action`, `entity`, `actor`, `status`.

## Users

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/users` | `users.view` |
| POST | `/users` | `users.create` |
| GET | `/users/:id` | `users.view` |
| PUT | `/users/:id` | `users.edit` |
| PATCH | `/users/:id/role` | `users.edit` + `roles.assign` |
| DELETE | `/users/:id` | `users.delete` |

List query: `page`, `limit`, `search`, `status`, `role`, `sort`.

Refused regardless of permission: changing your own role or status, deleting your
own account, editing or deleting a super admin unless you are one, assigning a role
whose permissions exceed your own, and removing the last active super admin.

## Roles and permissions

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/roles` | `roles.view` |
| POST | `/roles` | `roles.create` |
| GET | `/roles/:id` | `roles.view` |
| PUT | `/roles/:id` | `roles.edit` |
| PUT | `/roles/:id/permissions` | `roles.assign` |
| DELETE | `/roles/:id` | `roles.delete` |
| GET | `/permissions` | `permissions.view` |

A permission change bumps the token version of every user holding the role, so
their next request is rejected with `TOKEN_REVOKED` and they re-authenticate with
the new set. System roles cannot be deleted; a role still assigned to a user cannot
be deleted; the super admin role always holds every permission and is not editable.

## Services

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/services` | `services.view` |
| POST | `/services` | `services.create` |
| GET | `/services/:id` | `services.view` |
| PUT | `/services/:id` | `services.edit` |
| PATCH | `/services/:id/status` | `services.toggle` |
| DELETE | `/services/:id` | `services.delete` |

Fields: `name`, `key`, `description`, `icon`, `category`, `tab`, `url`, `status`
(`enabled`/`disabled`), `visibility` (`public`/`authenticated`/`restricted`),
`roles`, `config`, `order`. Disabling a service removes it from
`/public/services` immediately. A service with application options attached cannot
be deleted.

## Application options

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/options` | `options.view` |
| POST | `/options` | `options.create` |
| GET | `/options/:id` | `options.view` |
| PUT | `/options/:id` | `options.edit` |
| PATCH | `/options/:id/value` | `options.edit` |
| DELETE | `/options/:id` | `options.delete` |

Types: `boolean`, `text`, `number`, `select`, `multiselect`, `json`. Each value is
checked against its type plus the option's own `validation` (`min`, `max`,
`pattern`, `required`) on every write. An option may name an extra
`editPermission` required to change it. Keys matching `password`, `secret`,
`api_key`, `token`, `connection_string` and similar are rejected with
`SENSITIVE_KEY`.

Options the portal reads: `portal.brand_name`, `portal.brand_suffix`,
`portal.hero_tagline`, `portal.hero_title`, `portal.hero_title_accent`,
`portal.hero_subtitle`, `portal.news_page_size`, `portal.quick_access_enabled`,
`portal.people_search_enabled`, `portal.default_theme`, `portal.footer_note`,
`portal.sidebar_note`.

## Content

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/content` | `content.view` |
| GET | `/content/categories` | `content.view` |
| POST | `/content` | `content.create` |
| GET | `/content/:id` | `content.view` |
| GET | `/content/:id/revisions` | `content.view` |
| PUT | `/content/:id` | `content.edit` |
| PATCH | `/content/:id/publish` | `content.edit` + `content.publish` |
| DELETE | `/content/:id` | `content.delete` |

`PATCH .../publish` takes `{ action: "publish" | "unpublish" | "schedule" | "archive", scheduledFor? }`.
`content.publish` is required for any status other than `draft`, including when the
status arrives through `PUT`. Each update stores a revision (the last 20 are kept).
Bodies are sanitised server-side: scripts, event handlers and `javascript:` URLs are
stripped.

In the portal, `category` is the Documents folder and `country` is the country tab.

## News

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/news` | `news.view` |
| POST | `/news` | `news.create` |
| GET | `/news/:id` | `news.view` |
| GET | `/news/:id/revisions` | `news.view` |
| PUT | `/news/:id` | `news.edit` |
| PATCH | `/news/:id/publish` | `news.edit` + `news.publish` |
| DELETE | `/news/:id` | `news.delete` |

Fields: `title`, `slug`, `summary`, `body`, `featuredImage`, `images`, `category`,
`scope` (`Global`/`Local`), `tags`, `status`, `scheduledFor`, `seoTitle`,
`seoDescription`, `isFeatured`.

### Tag selection

`tags` accepts existing ids and new names together, which is what lets an author
create a tag without leaving the editor:

```json
{ "tags": { "ids": ["652f…", "653a…"], "newNames": ["Cybersecurity", "Awareness"] } }
```

Each name in `newNames` is created if missing and reused if it already exists
(matched on slug, so case and punctuation do not create duplicates). Tags are
stored as ObjectId references, never as a delimited string.

## Tags

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/tags` | any of `news.tags.manage`, `news.view`, `news.create`, `news.edit`, `content.view` |
| POST | `/tags` | any of `news.tags.manage`, `news.create`, `news.edit` |
| GET | `/tags/:id` | `news.view` |
| PUT | `/tags/:id` | `news.tags.manage` |
| DELETE | `/tags/:id` | `news.tags.manage` |

`GET /tags?withCounts=true` includes `newsCount` and `contentCount`, aggregated
rather than denormalised. `POST /tags` returns the existing tag instead of a
conflict, so two authors creating the same tag at once cannot duplicate it.
Deleting a tag in use returns 409 with `TAG_IN_USE`.

## Media

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/media` | `media.view` |
| POST | `/media/upload` | `media.upload` |
| GET | `/media/:id/references` | `media.view` |
| PUT | `/media/:id` | `media.upload` |
| DELETE | `/media/:id` | `media.delete` |

`POST /media/upload` is `multipart/form-data` with `file`, and optional `alt` and
`folder`. Allowed types: JPEG, PNG, GIF, WebP, AVIF, PDF, plain text, and the
Office `.docx`, `.xlsx` and `.pptx` formats. The declared type must match the
file's magic number, so a renamed script is rejected with `CONTENT_MISMATCH`. The
size ceiling is `MAX_UPLOAD_SIZE_MB` (8 MB by default).

Deleting a file still referenced returns 409 with `MEDIA_IN_USE` and the counts;
`DELETE /media/:id?force=true` detaches it from those items first. Files are served
from `/uploads/...` with `X-Content-Type-Options: nosniff`.
