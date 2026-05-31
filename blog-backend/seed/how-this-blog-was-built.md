---
title: "How this blog runs on Cloudflare with teenybase"
slug: "how-this-blog-was-built"
excerpt: "A meta first post: the blog you're reading is a single-file teenybase backend on Cloudflare Workers + D1 + R2, with an Astro SSR front-end and a custom markdown editor at /admin. Here's exactly how it was wired up."
tags: ["cloudflare", "teenybase", "astro", "meta"]
published: true
---

This is the first post on the blog, and it's about the blog itself — how it
got here. The whole thing is self-hosted on the Cloudflare developer platform,
and the moving parts are smaller than you'd expect.

## The shape of it

There are two Cloudflare Workers:

1. **The backend** — a [teenybase](https://teenybase.com) project deployed at
   `anksinblog.theserverless.dev`. teenybase is a "single-file backend":
   you declare your tables, auth, and access rules in one `teenybase.ts`, and it
   generates a D1 (SQLite) database, a REST API, and an admin UI. File uploads
   (post cover images) go to an R2 bucket.
2. **The site** — `anks.in` itself, an Astro app rendered server-side on a
   Worker. `/blog` and `/admin` are real routes in this app; the blog pages read
   posts from the backend's REST API at request time, and `/admin` is a custom
   markdown editor with live preview that writes back to the same API.

No iframes, no separate dashboards — `anks.in/admin` and `anks.in/blog` are just
pages on the site.

## Step 1 — the backend schema

teenybase scaffolds with `npx teeny create`. The schema is plain TypeScript. The
`posts` table is the heart of it:

```ts
{
  name: 'posts',
  autoSetUid: true,
  fields: [
    ...baseFields, // id, created, updated
    { name: 'author_id', type: 'relation', sqlType: 'text', notNull: true,
      foreignKey: { table: 'users', column: 'id' } },
    { name: 'title', type: 'text', sqlType: 'text', notNull: true },
    { name: 'slug', type: 'text', sqlType: 'text', notNull: true, unique: true },
    { name: 'excerpt', type: 'text', sqlType: 'text' },
    { name: 'cover_image', type: 'file', sqlType: 'text' },
    { name: 'body', type: 'text', sqlType: 'text', notNull: true },
    { name: 'tags', type: 'json', sqlType: 'text' },
    { name: 'published', type: 'bool', sqlType: 'boolean', default: false },
    { name: 'published_at', type: 'date', sqlType: 'timestamp' },
  ],
  triggers: [createdTrigger, updatedTrigger],
  indexes: [{ fields: 'slug' }, { fields: 'published' }],
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

Those `rules` are row-level security: the public can read **published** posts,
but only the author can create, edit, or delete their own. teenybase enforces
them at the database layer, so the API is safe to call straight from the browser.

## Step 2 — migrations and deploy

```bash
npx teeny generate --local   # turn the config into SQL migrations
npx teeny deploy --remote     # create the D1 db + R2 bucket, apply migrations, ship the Worker
```

`teeny deploy` auto-creates the D1 database and R2 bucket on first run and wires
the bindings into `wrangler.jsonc`. Secrets (`JWT_SECRET`, the admin password for
the built-in PocketUI dashboard, etc.) are uploaded as Worker secrets rather than
committed.

## Step 3 — the front-end

The Astro site moved from a static GitHub Pages build to **SSR on a Cloudflare
Worker** (the `@astrojs/cloudflare` adapter). That's what makes the pages
dynamic: each request to `/blog` or `/blog/[slug]` fetches live data from the
teenybase API and renders it on the server, so posts are crawlable and fast.
Client-side sections show skeleton loaders while data arrives.

## Step 4 — the editor

`/admin` is a small single-page editor: a CodeMirror markdown pane on the left, a
rendered preview on the right, drag-and-drop image upload to R2, and a publish
toggle. It authenticates against the `users` table with a JWT and talks to the
same `/api/v1/table/posts/*` endpoints everything else uses.

## Step 5 — DNS

The last step was repointing `anks.in` from GitHub Pages to the Cloudflare
Worker. After that, the whole site — marketing pages, blog, and admin — serves
from one place.

That's the entire stack. The next iteration moves the rest of the site's content
(projects, experience, skills) into teenybase tables too, so everything on the
page becomes editable from `/admin`.
