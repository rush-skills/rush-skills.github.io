# Deploy runbook — anks.in (single Cloudflare Worker)

The whole site is **one Cloudflare Worker** on your account: Astro SSR for the
pages (`/`, `/blog`, `/admin`) plus the [teenybase](https://teenybase.com) API
mounted at `/api/*`, all sharing one D1 database and one R2 bucket. There is no
separate backend service.

- Site + API code: the repo root (Astro). Build with `npm run build`.
- Data model: `blog-backend/teenybase.ts` (imported by the Worker at
  `src/server/teeny.ts`).
- Bindings: `wrangler.jsonc` at the repo root (`PRIMARY_DB` = D1, `FILES` = R2).

Everything is validated locally already: `npm run build` is clean and
`teeny generate` produces the SQL migrations. What needs **your** Cloudflare
account is creating the resources, setting secrets, deploying, and DNS — no
Cloudflare credentials are available from the build sandbox.

---

## Prerequisites

- Cloudflare account `Ankurgr8on@gmail.com's Account`
  (id `b252e906e8575b5d204c9cb99f829814`).
- `anks.in` added as a **zone** on that account (nameservers pointed at
  Cloudflare). This is the one step that can't be done by API — it's a change at
  your domain registrar.
- Wrangler auth locally: `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID`.

## 1. Create the D1 database and R2 bucket

```bash
npx wrangler d1 create anksin-db
npx wrangler r2 bucket create anksin-files
```

Copy the `database_id` that `d1 create` prints into `wrangler.jsonc` (replace
`PLACEHOLDER_SET_AFTER_D1_CREATE`).

> These can also be created from the Cloudflare dashboard, or — since the
> Cloudflare connector in this session can provision them — I can create them for
> you and report back the `database_id`.

## 2. Generate and apply migrations

The migrations come from the teenybase schema:

```bash
cd blog-backend
npm install
npx teeny generate --local       # writes blog-backend/migrations/*.sql
cd ..
# apply them to the remote D1:
npx wrangler d1 migrations apply anksin-db --remote
```

## 3. Set Worker secrets

Generate strong random values (do not reuse dev defaults):

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put JWT_SECRET_USERS
npx wrangler secret put ADMIN_JWT_SECRET
npx wrangler secret put ADMIN_SERVICE_TOKEN
npx wrangler secret put POCKET_UI_EDITOR_PASSWORD
```

(`blog-backend/.dev.vars.example` lists the same keys for local `astro dev`.)

## 4. Deploy the Worker

```bash
npm run build
npx wrangler deploy
```

This deploys to `anks-in.<your-subdomain>.workers.dev`. Open it and verify:

- `/` — the marketing site renders.
- `/api/v1/health` — returns OK (teenybase is mounted).
- `/blog` — renders (empty until the first post).
- `/admin` — shows the login screen.

## 5. Create the owner account

Use teenybase's built-in admin (PocketUI) once to create your user:

```
https://anks-in.<your-subdomain>.workers.dev/api/v1/pocket/
```

Log in with `POCKET_UI_EDITOR_PASSWORD`, add a row to `users` with your email +
password. That's the account `/admin` logs in with. (Self-serve signup is closed
by the `users` createRule.)

## 6. Seed the first (meta) post

```bash
API_BASE=https://anks-in.<your-subdomain>.workers.dev \
USER_EMAIL=you@example.com USER_PASSWORD=your-password \
node blog-backend/seed/seed.mjs
```

Idempotent — it skips if the `how-this-blog-was-built` slug already exists. You
can also just paste the markdown into a new post from `/admin`.

## 7. Point anks.in at the Worker

Add a route for the custom domain (in `wrangler.jsonc` or the dashboard):

```jsonc
"routes": [{ "pattern": "anks.in", "custom_domain": true }]
```

Redeploy, confirm `https://anks.in` serves the Worker and `/blog` + `/admin`
work against the live database, then retire the old GitHub Pages deploy.

---

## Day-to-day

| Task | Command |
| --- | --- |
| Local dev (site + API + admin) | `npm run dev` (bindings via Miniflare) |
| Schema change | edit `blog-backend/teenybase.ts` → `teeny generate` → `wrangler d1 migrations apply` → `wrangler deploy` |
| Type check | `npx astro check` |
| Deploy | `npm run build && npx wrangler deploy` |

## Useful endpoints (same origin)

| Purpose | Path |
| --- | --- |
| Health | `/api/v1/health` |
| Swagger UI | `/api/v1/doc/ui` |
| teenybase admin (PocketUI) | `/api/v1/pocket/` |
| Custom admin SPA | `/admin` |
| List published posts | `/api/v1/table/posts/list?where=published%20=%20true&order=published_at%20desc` |

## Phase 2

Add `projects`, `experience`, `education`, `skills` tables to
`blog-backend/teenybase.ts`, migrate, then flip `enabled: true` for each in
`src/lib/admin/schema.ts`. They already have admin definitions, so they'll appear
in `/admin` immediately, and the homepage components can switch from YAML to the
API the same way the blog did.
