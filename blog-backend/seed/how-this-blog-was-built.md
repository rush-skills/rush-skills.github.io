---
title: "How this site became a CMS: one Cloudflare Worker running Astro and teenybase"
slug: "how-this-blog-was-built"
excerpt: "An honest, end-to-end walkthrough of turning anks.in from a static GitHub Pages site into a fully self-editable CMS — Astro SSR and a teenybase backend inside a single Cloudflare Worker, with every section, color, and icon editable from /admin with drafts and preview. The start state, the end state, and every gotcha in between."
tags: ["cloudflare", "teenybase", "astro", "workers", "d1", "cms", "meta"]
published: true
ai_generated: true
---

This is the first post on the blog and — because I can't resist a good bootstrap
paradox — it's about the site you're looking at. Not just the blog: the *whole*
site. How does this page reach you, and how did the words, the colors, the
project cards, and the icons all become things I can edit from a browser instead
of from a text editor and a `git push`?

The short version: the entire site is rendered by **one Cloudflare Worker** that
runs an Astro application *and* a [teenybase](https://teenybase.com) backend at
the same time, reading from a single SQLite database at the edge. Every editable
region lives in that database, and there's an admin at `/admin` to change it —
with drafts, a live preview, and a publish button.

The longer version is the post I wish I'd found when I started: not a tidy "look
how clean this is" tour, but the actual start and end states, the decisions in
between, the things that broke, and why the final shape is what it is.

## The start state

`anks.in` used to be a **static site**. Astro built it to a folder of HTML, and
GitHub Pages served that folder. The apex domain pointed at GitHub's IPs with four
`A` records. This is a genuinely great setup for a portfolio: fast, free, nothing
to break at 3am.

But "static" means every change is a code change and a redeploy. The content lived
in YAML files (`src/data/hero.yaml`, `projects.yaml`, and so on) that I hand-edited
and committed. Want to fix a typo, add a project, or try a different accent color?
Edit YAML, commit, wait for the build. Fine for an engineer; not a CMS.

## The end state

Same site, visually identical, but now:

- It runs on a **single Cloudflare Worker** serving `/`, `/blog`, `/admin`, and
  `/api` — one program, one origin, one D1 database, one R2 bucket.
- The home page is **server-rendered from the database**. Every section — hero,
  about, experience, projects, skills, education, contact — plus the **theme
  (colors and fonts)** and **every icon** is a row in a `content` table.
- There's an admin at `/admin` where I edit all of it through real forms
  (repeatable project lists, color pickers, icon fields), save a **draft**,
  **Preview** the site with my unpublished changes, then **Publish**.
- The committed YAML still exists — as the **seed and the fallback**. A fresh
  clone with an empty database renders the exact same site, because each section
  falls back to its YAML. That's also what makes this repo a template: anyone can
  clone it, run one command, and get their own copy to customise from the admin.
- There's a Markdown **blog** (this) with its own editor.

Same speed, same SEO, but the content is now data, not code.

## Choosing the pieces

Three constraints shaped every decision:

1. **It should run on the Cloudflare developer platform.** Workers + D1 (their
   SQLite) + R2 (their object storage) is a cheap, fast, global stack I already
   use.
2. **One Worker, one account, one origin.** An earlier draft had a *separate*
   backend Worker on a different domain — two deploys, two sets of secrets, and
   CORS between them. I scrapped it. Everything now lives in a single Worker that
   owns `anks.in`.
3. **The backend shouldn't be hand-rolled.** I didn't want to write auth, a REST
   API, migrations, and an admin from scratch. That's [teenybase](https://teenybase.com).

**teenybase** is a "single-file backend": you describe your tables, auth, and
access rules in one TypeScript file, and it gives you a D1-backed REST API, JWT
auth with row-level security, file uploads to R2, and a built-in admin. It's built
on [Hono](https://hono.dev), which matters more than it sounds like it should.

**Astro** stays as the front-end framework but switches from static output to
**server-side rendering on Cloudflare**, so pages can read the database per request.

## The key idea: two apps, one Worker

Here's the whole trick. A Cloudflare Worker has a single entry point: a
`fetch(request)` function. Astro's Cloudflare adapter generates one. teenybase's
backend is, underneath, a Hono app — which is *also* just a `fetch(request)`
handler. So "can these two coexist?" becomes "can one fetch handler call another?"
And the answer is yes, because Hono apps compose.

Astro owns routing. One catch-all route, `/api/[...path]`, forwards every request
straight into the teenybase Hono app:

```ts
// src/pages/api/[...path].ts
export const prerender = false;
import { getTeenyApp } from '../../server/teeny';

const handler = async ({ request, locals }) =>
  getTeenyApp().fetch(request, env, locals.cfContext);  // hand off to teenybase
export const GET = handler;
export const POST = handler;
// ...PUT, PATCH, DELETE, OPTIONS, HEAD
```

Because they share an address space, the *server-rendered pages can read the
database without a network request at all* — no CORS, no second origin, no latency
hop. The "frontend" and the "backend" are the same Worker reaching into the same
D1 binding.

## Making the content a database — without losing the fallback

The design I landed on is **DB-first, YAML-as-seed**. Every section of the site is
one row in a `content` table, and each row carries two JSON snapshots:

- `published` — what the live site renders.
- `draft` — the work in progress you see in Preview.

During SSR, a small loader (`src/lib/content.ts`) reads those rows **directly from
the D1 binding** — not over HTTP — and falls back to the committed YAML for any
section the database doesn't have yet:

```ts
const merged = yamlBaseline();                 // src/data/*.yaml — always renders
const rows = await env.PRIMARY_DB.prepare(
  'SELECT section, draft, published FROM content',
).all();
for (const r of rows.results ?? []) {
  const val = preview ? (r.draft ?? r.published) : r.published;
  if (val != null) merged[r.section] = JSON.parse(val);
}
```

Reading D1 directly during SSR has a nice security property: the public site never
calls the content API, so that API can be locked to authenticated admins only.
**Drafts are never exposed** — the only way to see them is the admin's Preview,
which sets a short-lived `tb_preview` cookie that the loader checks.

This is also why a fresh clone just works: empty database, every section falls
through to YAML, identical site.

### Gotcha: teenybase's `json` field only stores JSON *scalars*

I first declared the `draft` and `published` columns as teenybase's `json` field
type. Seeding worked. Then the admin tried to save an edit and got a wall of
validation errors:

```
expected string, received object
expected number, received object
expected boolean, received object
```

That's a zod union — `string | number | boolean | null` — rejecting an object.
teenybase's `json` field validates JSON *scalars*, not arbitrary nested objects.
The fix was to store the snapshots as plain **`text`** columns and do the
`JSON.stringify` / `JSON.parse` myself. The SQLite column was already `TEXT`, so
no migration — just a type annotation and a redeploy.

### Gotcha: `insert` and `edit` don't take the same shape

The error above had a sharper twist. Editing *any* field failed identically —
even a plain text one — and the errors were the same whether I sent a string or an
object. That "identical regardless of input" is the tell: the failure wasn't about
my value, it was about the **envelope**. teenybase's `insert` wants
`{ values: { … } }`, but `edit` wants the fields at the **top level**:

```ts
// insert
POST /api/v1/table/content/insert   { "values": { "draft": "…" } }
// edit  — fields at the top level, NOT wrapped in { values }
POST /api/v1/table/content/edit/:id { "draft": "…" }
```

The admin client had been wrapping edit in `{ values }` — which made teenybase
treat `values` as a bogus column and reject the whole payload. One line to fix,
and it un-broke the post editor too (which had simply never been exercised).

## The admin: a schema-driven CMS

`/admin` is a small single-page app, and it's **schema-driven**. One file describes
every editable section as a tree of fields — text, textarea, color, icon, image,
tags, **groups** (the hero's two CTA buttons), and **repeatable lists** (projects →
items → links, nested two deep). A recursive renderer turns that description into a
real form that edits a live clone of the section's JSON. No raw JSON editing; you
get color pickers and live-animating icon previews.

Every section editor has three actions:

- **Save draft** — writes `draft`. The live site doesn't change.
- **Preview** — saves the draft, sets the preview cookie, and opens the site so you
  see exactly what Publish would ship.
- **Publish** — promotes the draft to `published`. Live immediately.

The theme editor is the fun one: it writes color and font values that the layout
injects as CSS variables at render time, overriding the stylesheet. You can
re-skin the entire site — light and dark — without touching code.

The blog has its own editor: a split pane with a markdown toolbar, a live preview,
keyboard shortcuts, and drag-or-paste image upload straight to R2. Authentication
is teenybase's — the admin logs in against the `users` table, gets a JWT, and the
row-level rules in the schema do the rest.

One implementation note that cost a few minutes: `@cloudflare/workers-types`
defines globals (like `Element`) that collide with the browser DOM types the admin
relies on. The fix was to *not* make them global — the server code declares the
couple of Cloudflare types it needs locally, and the browser code keeps the real
DOM lib. Two worlds, one repo, kept apart on purpose.

## The cutover: moving anks.in off GitHub Pages

With the Worker deployed and verified on its `*.workers.dev` URL, the last step was
DNS. `anks.in` was a Cloudflare zone already (just pointing its `A`/`AAAA` records
at GitHub Pages), so attaching the Worker as a **Custom Domain** should have been
one line in `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "anks.in", "custom_domain": true }]
```

It silently refused. The Custom Domain API returned the real reason:

```
Hostname 'anks.in' already has externally managed DNS records (A, CNAME, etc).
```

The apex still had the four GitHub Pages `A` records (and four `AAAA`). A Custom
Domain wants to manage that record itself, and won't clobber existing ones. So I
deleted the eight GitHub Pages records — and *only* those, leaving the `MX` records
so email kept working — then attached the domain. Cloudflare issued the cert, and
within a minute `https://anks.in` was served by the Worker.

There was a brief window right after the cert provisioned where a fraction of
requests failed — connections dropping with no Cloudflare headers at all, which is
the signature of edge/cert propagation, not an application error. It cleared on its
own in a few minutes. Worth knowing so you don't go chasing a bug that isn't there.

## Clone-and-run

Because the YAML is the seed and the database is the source of truth, this repo is
a template. After `npx wrangler login`:

```bash
ADMIN_EMAIL=you@example.com npm run setup
```

One idempotent script provisions D1 + R2, wires the config, applies migrations,
uploads strong secrets, deploys, bootstraps teenybase, creates your admin user, and
seeds the content. It prints your live URL and admin credentials. Open `/admin` and
make it yours — no code required.

## The whole system

That's it: one Worker, two frameworks that turned out to be the same kind of thing
underneath, and a SQLite file at the edge holding everything — the site content,
the theme, the blog, and these words. The site went from *static files I edit and
redeploy* to *a database I edit from a browser*, without giving up the speed, the
SEO, or the "nothing to break at 3am" that made the static version good in the
first place.

This site is built with [Astro](https://astro.build) and
[teenybase](https://teenybase.com).

## Since then: continuous deployment

The first cut of this post ended at `npm run setup` and a manual
`npx wrangler deploy`. The deploy story is better now.

The repo is connected to **Cloudflare Workers Builds**, Cloudflare's native Git
integration. Every push to `master` builds the Worker (`npm run build`) and
deploys it (`npx wrangler deploy`) on its own — no GitHub Actions, no API tokens
sitting in CI. I deleted the old Actions workflows entirely. Pull requests get
their own **preview deployment** on a `*.workers.dev` URL, bound to the real D1
and R2, so I can click through a change against live data before it merges.

One gotcha fell out of this. Workers Builds runs the build from a **fresh git
checkout**, so anything the build needs has to be committed. The D1 migrations
had been `.gitignore`d — they're generated by teenybase, and that was fine when I
deployed from my laptop — but a clean CI checkout had no schema to apply.
Committing the `migrations/` directory fixed it, and it's the right call anyway:
migrations are the schema's source of truth, not a build artifact.

The home page also grew two **read-only feeds** that reuse the blog's in-process
pattern: it now reads the latest posts and a stream of **links** (articles,
videos, bookmarks) straight from their D1 tables during SSR — no extra API hop —
and each gets its own RSS feed (`/rss.xml`, `/links.xml`).

The core didn't move: still one Worker, still Astro SSR reading D1 directly, still
YAML as the seed. What changed is that shipping is now just `git push`.
