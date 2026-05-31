# anks.in

Personal portfolio website for Ankur Singh.

**Live at [anks.in](https://anks.in)**

> **Want to build your own portfolio like this?**
> Use the [Astro Monograph](https://github.com/theserverlessdev/astro-monograph) theme — it's free, open-source (MIT), and ready to deploy.
> Just edit the YAML files with your own content.
>
> **Theme repo:** [github.com/theserverlessdev/astro-monograph](https://github.com/theserverlessdev/astro-monograph)
> **Demo:** [monograph.theserverless.dev](https://monograph.theserverless.dev)

## What this is

A portfolio **and** a self-hosted CMS on a single Cloudflare Worker:

- **Astro SSR** renders the site; **[teenybase](https://teenybase.com)** provides the
  API, auth, and admin — both in one Worker, sharing one D1 database + R2 bucket.
- Every region of the site (hero, about, experience, projects, skills, education,
  contact, **plus colors, fonts, and icons**) is editable from `/admin` — no code or
  redeploys. Edits save as **drafts**, you **Preview** them, then **Publish**.
- Content lives in D1 and is read during SSR. The committed `src/data/*.yaml` is the
  **seed** and the fallback, so a fresh clone always renders.
- There's a Markdown **blog** at `/blog` and a **links feed** at `/links`, both
  managed from the admin, with **RSS** (`/rss.xml`, `/links.xml`).

## Continuous deployment

Pushes to `master` auto-build and deploy via **Cloudflare Workers Builds** (no
GitHub Actions). See [`blog-backend/CI-CD.md`](blog-backend/CI-CD.md) for the
one-time dashboard connection steps.

## Clone & run your own

You need a (free) Cloudflare account and Node 18+.

```bash
git clone <your-fork> && cd <repo>
npm install
npx wrangler login

# Provisions D1 + R2, deploys, creates your admin user, and seeds content:
ADMIN_EMAIL=you@example.com npm run setup
```

`npm run setup` (see `scripts/setup.mjs`) is idempotent and prints your live URL and
admin credentials at the end. Open `/admin`, sign in, and customise everything live.

**Custom domain** (optional, must be a zone on your Cloudflare account):

```bash
DOMAIN=yourdomain.com ADMIN_EMAIL=you@example.com npm run setup
```

To re-seed content from YAML after editing it: `npm run seed:content` (add `-- --force`
to overwrite existing sections).

## Development

```bash
npm install
npm run dev
```

## Theme

This site is built with [Astro Monograph](https://github.com/theserverlessdev/astro-monograph). To publish theme changes:

```bash
npm run theme:dry   # preview at /tmp/astro-monograph
npm run theme       # build and push to theme remote
```

## License

Theme code is MIT (see the [theme repo](https://github.com/theserverlessdev/astro-monograph)). Personal content is all rights reserved — see [LICENSE](LICENSE).
