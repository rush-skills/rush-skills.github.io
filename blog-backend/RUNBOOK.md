# Deploy runbook — anks.in (single Cloudflare Worker)

The whole site is **one Cloudflare Worker** on your account: Astro SSR for the
pages (`/`, `/blog`, `/links`, `/admin`) plus the [teenybase](https://teenybase.com) API
mounted at `/api/*`, all sharing one D1 database and one R2 bucket. There is no
separate backend service.

> **Deploys are automatic.** The repo is connected to **Cloudflare Workers
> Builds**, so a push to `master` builds and deploys the Worker (and PRs get
> preview deployments). See [`CI-CD.md`](CI-CD.md). The steps below are for the
> initial provisioning / a manual deploy fallback.

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

> **Already done & verified.** Created on the account via the Cloudflare
> connector; IDs are wired into `wrangler.jsonc` (root) and
> `blog-backend/wrangler.jsonc`. The remote D1 was confirmed reachable and empty
> (only the internal `_cf_KV` table) — `deploy.sh` step 2 applies the schema.
>
> - D1 `anksin-db` → `d7415070-0708-4abe-a5dd-550c3fc51c29` (APAC / SIN)
> - R2 `anksin-files`
>
> If you ever need to recreate them:

```bash
npx wrangler d1 create anksin-db
npx wrangler r2 bucket create anksin-files
# then put the new database_id into wrangler.jsonc
```

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

This deploys to `anks-in.<your-subdomain>.workers.dev`. Open it and verify
`/`, `/blog`, and `/admin` render. **`/api/v1/health` will 500 until the next
step** — that's expected.

> **Or just run `bash blog-backend/deploy.sh`** from the repo root, which does
> steps 2–4 and prints the exact commands for 4a–6.

## 4a. Bootstrap teenybase's internal tables (REQUIRED)

Because we deploy the **Astro** Worker with `wrangler deploy` (not
`teeny deploy`), teenybase's one-time `setup-db` doesn't run automatically. It
creates the internal metadata tables (`_ddb_internal_kv`, migration registry,
`$settings`). Run it once with your `ADMIN_SERVICE_TOKEN`:

```bash
URL=https://anks-in.<your-subdomain>.workers.dev
TOKEN=<your ADMIN_SERVICE_TOKEN>
curl -sS -X POST "$URL/api/v1/setup-db" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H "Origin: $URL" -d '{}'
```

After this, `$URL/api/v1/health` returns OK and auth works.

## 5. Create the owner account

Self-serve signup is closed (`users` createRule), so create your account once
using the admin token, which bypasses the rule:

```bash
curl -sS -X POST "$URL/api/v1/table/users/auth/sign-up" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $URL" \
  -d '{"username":"ankur","email":"you@anks.in","password":"<strong-password>","passwordConfirm":"<same>","name":"Ankur Singh"}'
```

That's the account `/admin` logs in with. (You can also use teenybase's built-in
admin at `$URL/api/v1/pocket/`, logging in with `POCKET_UI_EDITOR_PASSWORD`.)

## 6. Seed the first (meta) post

```bash
API_BASE=https://anks-in.<your-subdomain>.workers.dev \
USER_EMAIL=you@example.com USER_PASSWORD=your-password \
node blog-backend/seed/seed.mjs
```

Idempotent — it skips if the `how-this-blog-was-built` slug already exists; pass
`--force` to **update** an existing post from the markdown (the live blog renders
from D1, so editing the seed file alone won't change the published post). You can
also just edit the post from `/admin`.

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
| Deploy | **push to `master`** → Workers Builds auto-builds & deploys (see [`CI-CD.md`](CI-CD.md)). Manual fallback: `npm run build && npx wrangler deploy` |

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
