---
title: "Building this blog: one Cloudflare Worker running Astro and teenybase together"
slug: "how-this-blog-was-built"
excerpt: "A long, honest walkthrough of how anks.in became a dynamic, database-backed site — Astro SSR and a teenybase backend living inside a single Cloudflare Worker, with a custom markdown admin at /admin. Every step, every gotcha."
tags: ["cloudflare", "teenybase", "astro", "workers", "d1", "meta"]
published: true
---

This is the first post on the blog, and — because I can't resist a good
bootstrap paradox — it's about the blog itself. How does this page reach you?
What's underneath it? The short version: the entire site, including the words
you're reading, is rendered by **one Cloudflare Worker** that runs an Astro
application *and* a [teenybase](https://teenybase.com) backend at the same time,
reading from a single SQLite database at the edge.

The longer version is what follows. I've tried to write the post I wish I'd
found when I started — not a tidy "look how clean this is" tour, but the actual
sequence of decisions, the things that didn't work the first time, and why the
final shape is what it is.

## Where this started

`anks.in` used to be a static site. Astro built it to a folder of HTML, and
GitHub Pages served that folder. This is a genuinely great setup for a portfolio:
fast, free, nothing to break at 3am. But "static" means every change is a
code change and a redeploy. I wanted a blog I could write from a browser, and —
eventually — I wanted the rest of the site (projects, work history, skills) to
be editable the same way, instead of living in YAML files I hand-edit.

So the goal became: keep the speed and the SEO of the static site, but make the
content come from a database, and give myself a real editor to manage it.

## Choosing the pieces

Three constraints shaped every decision:

1. **It should run on the Cloudflare developer platform.** I already host other
   things there; Workers + D1 (their SQLite) + R2 (their object storage) is a
   cheap, fast, global stack.
2. **One Worker, one account, one origin.** An earlier draft of this project had
   a *separate* backend Worker on a different domain. That meant two deploys, two
   sets of secrets, and CORS between them. I scrapped it. Everything now lives in
   a single Worker that owns `anks.in` — `/`, `/blog`, `/admin`, and `/api` are
   all the same program.
3. **The backend shouldn't be hand-rolled.** I didn't want to write auth, a REST
   API, migrations, and an admin from scratch. That's where teenybase comes in.

**teenybase** is a "single-file backend": you describe your tables, auth, and
access rules in one TypeScript file, and it gives you a D1-backed REST API, JWT
auth with row-level security, file uploads to R2, and a built-in admin UI. It's
built on [Hono](https://hono.dev), which matters more than it sounds like it
should — I'll come back to that.

**Astro** stays as the front-end framework, but switches from static output to
**server-side rendering on Cloudflare**, so pages can read the database per
request.

## The key idea: two apps, one Worker

Here's the part I want to dwell on, because it's the whole trick.

A Cloudflare Worker has a single entry point: a `fetch(request)` function. Astro's
Cloudflare adapter generates one. teenybase's backend is, underneath, a Hono app
— which is *also* just a `fetch(request)` handler. So the question "can these
two coexist?" becomes "can one fetch handler call another?" And the answer is
yes, trivially, because Hono apps compose.

Concretely, the Astro app owns routing. One catch-all route, `/api/[...path]`,
forwards every request straight into the teenybase Hono app:

```ts
// src/pages/api/[...path].ts — every method, the whole API surface
export const prerender = false;
import { getTeenyApp } from '../../server/teeny';

const handler = async ({ request, locals }) => {
  const { env, ctx } = locals.runtime;          // Cloudflare bindings (D1, R2)
  return getTeenyApp().fetch(request, env, ctx); // hand off to teenybase
};
export const GET = handler;
export const POST = handler;
// ...PUT, PATCH, DELETE, OPTIONS, HEAD
```

teenybase takes over from `/api/v1` downward: the REST endpoints, the auth flows,
the file uploads, and its admin dashboard. Astro handles everything else.

And because they share an address space, the *server-rendered pages can call the
API without a network request at all*. When the `/blog` page needs posts, it
doesn't `fetch('https://.../api/...')` over HTTP — it invokes the same Hono app
in-process:

```ts
// the blog list page, rendering on the server
const { env, ctx } = Astro.locals.runtime;
const res = await getTeenyApp().fetch(
  new Request('https://anks.in/api/v1/table/posts/list?where=published%20=%20true'),
  env, ctx,
);
const posts = await res.json();
```

No CORS. No second origin. No latency hop. The "frontend" and the "backend" are
the same Worker reaching into the same D1 binding.

## Step 1 — Describe the data

teenybase projects are scaffolded with `npx teeny create`. The schema is plain
TypeScript, and the heart of it is the `posts` table:

```ts
{
  name: 'posts',
  autoSetUid: true,
  fields: [
    ...baseFields,                 // id, created, updated (added for you)
    { name: 'author_id', type: 'relation', sqlType: 'text', notNull: true,
      foreignKey: { table: 'users', column: 'id' } },
    { name: 'title', type: 'text', sqlType: 'text', notNull: true },
    { name: 'slug', type: 'text', sqlType: 'text', notNull: true, unique: true },
    { name: 'excerpt', type: 'text', sqlType: 'text' },
    { name: 'cover_image', type: 'file', sqlType: 'text' },   // stored in R2
    { name: 'body', type: 'text', sqlType: 'text', notNull: true }, // markdown
    { name: 'tags', type: 'json', sqlType: 'text' },
    { name: 'published', type: 'bool', sqlType: 'boolean' },
    { name: 'published_at', type: 'date', sqlType: 'timestamp' },
  ],
  triggers: [createdTrigger, updatedTrigger],
  indexes: [{ fields: 'slug' }, { fields: 'published' }, { fields: 'author_id' }],
  extensions: [{
    name: 'rules',
    listRule: 'published == true | auth.uid == author_id',
    viewRule: 'published == true | auth.uid == author_id',
    createRule: 'auth.uid != null & author_id == auth.uid',
    updateRule: 'auth.uid == author_id',
    deleteRule: 'auth.uid == author_id',
  }],
}
```

The `rules` block is the part that earns its keep. Those five expressions are
**row-level security**, enforced by teenybase at the database layer. Read them
out loud: anyone may *list* or *view* a post if it's published, or if they're its
author; only a logged-in user may *create* a post, and only as themselves; only
the author may *update* or *delete*. Because the database enforces this, the API
is safe to call directly from the browser — an unauthenticated visitor simply
cannot see a draft, no matter what query they send.

**First gotcha.** My initial schema had `default: false` on the `published`
field. teenybase's config validator rejected it (`default` expects a SQL
expression, not a raw boolean). The fix was to drop the DB-level default and have
the editor set `published` explicitly — which it does anyway. Small thing;
thirty seconds of confusion; worth mentioning because the error message pointed
at a field *index*, not a name.

**Second gotcha.** The `auth` extension needs `jwtTokenDuration` and
`maxTokenRefresh` — leave them out and validation fails. The scaffold's template
includes them; my hand-written version didn't at first.

## Step 2 — Make Astro and teenybase build together

Switching Astro to SSR is two lines in `astro.config.mjs`: add the
`@astrojs/cloudflare` adapter. But the moment I did, the build broke — and the
break is instructive.

My data layer (`src/lib/data.ts`) read YAML files with `node:fs`. That's fine in
Node, but Astro now *prerenders* the static marketing pages using the Cloudflare
runtime, where `node:fs` doesn't exist:

```
[ERROR] Error: No such module "node:fs". imported from .../data_*.mjs
```

The fix was to stop reading files at runtime entirely. Vite can inline them at
build time:

```ts
const rawFiles = import.meta.glob('../data/*.yaml', {
  query: '?raw', import: 'default', eager: true,
});
```

Now the YAML is baked into the bundle as strings, parsed with `js-yaml`, and
there's no filesystem dependency at all. The marketing pages prerender cleanly;
the dynamic pages render on demand.

The other thing to get right: keep `output: 'static'`. With the Cloudflare
adapter, that means "static by default, opt into SSR per route" — so the
homepage stays prerendered HTML (great for SEO and TTFB) while `/blog`,
`/blog/[slug]`, `/admin`, and `/api` each declare `export const prerender =
false` and run in the Worker.

**The gotcha I was bracing for that didn't happen:** I fully expected
`teenybase/worker` to refuse to bundle inside Astro's Worker build — version
skews, Node built-ins, the usual. It just... worked. Clean build, no "unexpected
Node.js imports" warning. That's the Hono lineage paying off: it's written for
exactly this runtime.

## Step 3 — Render the blog

Two routes, both server-rendered:

- `/blog` lists published posts, newest first.
- `/blog/[slug]` fetches one post and renders its markdown body to HTML with
  [`marked`](https://marked.js.org), wrapped in the site's typography.

Both call the API in-process as shown earlier, and both degrade gracefully: if
the API call fails, the list shows an empty state rather than a stack trace.
Client-loaded sections show skeleton placeholders while data arrives, so you
never see a layout jump.

## Step 4 — The admin

The brief was "a nice editor with markdown and a live preview," and then "build
out the admin for the blog, and then for everything." So `/admin` isn't a
single page — it's a small single-page app, and it's **schema-driven**.

There's one file that describes every editable entity: its table, its fields and
their types, which columns show in the list. The admin renders itself from that
description. Today it manages blog posts; when I move projects and work history
into the database (next section), they show up in the admin automatically,
because adding them is a config entry, not new UI code.

The post editor itself is the centerpiece: a split pane with a markdown toolbar
(bold, headings, links, code, lists), a **live preview** that updates as you
type, keyboard shortcuts (`Cmd/Ctrl-B`, `-I`, `-K`, `-S` to save), and
drag-or-paste **image upload** straight to R2. Tags are entered as pills; the URL
slug auto-derives from the title until you edit it by hand; publishing stamps the
date automatically.

Authentication is teenybase's: the admin logs in against the `users` table, gets
a JWT, and sends it as a bearer token on every write. The row-level rules from
Step 1 do the rest.

One implementation note that cost me a few minutes: `@cloudflare/workers-types`
defines globals (like `Element`) that collide with the browser DOM types the
admin SPA relies on. Pulling those types in globally turned the admin's DOM code
red. The fix was to *not* make them global — the server code declares the couple
of Cloudflare types it needs locally, and the browser code keeps the real DOM
lib. Two worlds, one repo, kept apart on purpose.

## Step 5 — Deploy and DNS

The backend resources are created on first deploy. teenybase wraps Wrangler so
that one command provisions the D1 database, creates the R2 bucket, applies the
migrations, and ships the Worker:

```bash
npx teeny generate     # turn the schema into SQL migrations
npx teeny deploy        # create D1 + R2, apply migrations, deploy the Worker
```

Secrets — the JWT signing keys, the admin password — are uploaded as Worker
secrets, never committed. Then the owner account is created once, and this very
post is seeded into the database.

The final step is DNS: repointing `anks.in` from GitHub Pages to the Cloudflare
Worker. I deploy to a temporary `*.workers.dev` URL first, click around, confirm
the blog and admin both work against the live database, and only then move the
domain. The instant the DNS flips, the whole site — marketing pages, blog, and
admin — is served by the one Worker.

## What's next

Right now the blog is in the database and the rest of the site is still in YAML.
The plan is to finish the job: migrate `projects`, `experience`, `education`, and
`skills` into teenybase tables too. The admin is already built to handle them —
those entities are defined in its schema, just switched off until their tables
exist. When they're migrated, the homepage will render from the database like the
blog does, and I'll edit my own portfolio from `/admin` instead of from a text
editor and a git push.

That's the whole system: one Worker, two frameworks that turned out to be the
same kind of thing underneath, and a SQLite file at the edge holding everything —
including these words.
