# Backend deploy runbook (anksinblog.theserverless.dev)

The blog backend is a [teenybase](https://teenybase.com) project: one
`teenybase.ts` config → a Cloudflare Worker with a D1 database, an R2 bucket for
uploads, a REST API at `/api/v1`, and a built-in admin (PocketUI).

Everything here is validated locally (`teeny generate` produces the migrations in
this repo). The only thing that needs **your** Cloudflare account is the actual
deploy + DNS, since no Cloudflare credentials are available from the build
sandbox.

---

## Prerequisites

- A Cloudflare account, and the **`theserverless.dev` zone** added to it (for the
  backend's custom domain) — and later `anks.in`'s zone too (for the site).
- Node 18+ and `wrangler` auth: `npx wrangler login` (or set
  `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).

## 1. Install

```bash
cd blog-backend
npm install
```

## 2. Set production secrets

Generate strong values (don't reuse the dev defaults):

```bash
cp .dev.vars.example .prod.vars
# edit .prod.vars: set long random JWT_SECRET, JWT_SECRET_USERS,
# ADMIN_JWT_SECRET, ADMIN_SERVICE_TOKEN, and a real POCKET_UI_EDITOR_PASSWORD.
```

## 3. Deploy (auto-creates D1 + R2)

```bash
npx teeny generate --local        # (already generated; safe to re-run)
npx teeny deploy --remote         # creates the D1 db + R2 bucket, applies migrations, deploys the Worker
npx teeny secrets --remote --upload   # pushes .prod.vars as Worker secrets
```

`teeny deploy` rewrites `database_id` in `wrangler.jsonc` after creating the DB.
On first deploy, if the `theserverless.dev` custom domain isn't ready yet,
comment out the `routes` block in `wrangler.jsonc` to ship to
`anksinblog.<your-subdomain>.workers.dev`, verify, then re-enable it.

Confirm it's live:

```bash
curl https://anksinblog.theserverless.dev/api/v1/health
```

## 4. Create the owner account

Open the admin dashboard and create your user once:

```
https://anksinblog.theserverless.dev/api/v1/pocket/
```

Log in with `POCKET_UI_EDITOR_PASSWORD`, then add a row to the `users` table with
your email + password (this is the account the site's `/admin` editor logs in
with). Self-serve signup is intentionally closed (`createRule: auth.admin`).

## 5. Seed the first post (the meta post)

```bash
API_BASE=https://anksinblog.theserverless.dev \
USER_EMAIL=you@example.com USER_PASSWORD=your-password \
node seed/seed.mjs
```

This inserts `seed/how-this-blog-was-built.md`. It's idempotent (skips if the
slug already exists). You can also just paste the markdown into a new post from
the site's `/admin` editor once that's deployed.

---

## Useful endpoints

| Purpose | Path |
| --- | --- |
| Health | `GET /api/v1/health` |
| Swagger UI | `GET /api/v1/doc/ui` |
| Admin (PocketUI) | `GET /api/v1/pocket/` |
| List published posts | `GET /api/v1/table/posts/list?where=published%20%3D%20true&order=published_at%20desc` |
| View one post | `GET /api/v1/table/posts/view/{id}` |
| Login | `POST /api/v1/table/users/auth/login-password` |
| Create post | `POST /api/v1/table/posts/insert` (Bearer token) |

## Schema changes later

Edit `teenybase.ts`, then `npx teeny deploy --remote` regenerates and applies new
migrations. Phase 2 adds `projects`, `experience`, `education`, `skills` tables
here so the whole site becomes editable from `/admin`.
