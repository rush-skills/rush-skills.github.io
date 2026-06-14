# anks.in

Personal portfolio website for Ankur Singh.

**Live at [anks.in](https://anks.in)**

> **Want to build your own portfolio + CMS like this?**
> Use the [Astro Monograph + teenybase](https://github.com/theserverlessdev/astro-monograph-teenybase)
> template — free, open-source (MIT). One command deploys your own copy, fully
> editable from `/admin`.
>
> **Template repo:** [github.com/theserverlessdev/astro-monograph-teenybase](https://github.com/theserverlessdev/astro-monograph-teenybase)
>
> Prefer a simpler, CMS-free static version? There's also the plain
> [Astro Monograph](https://github.com/theserverlessdev/astro-monograph) theme
> ([demo](https://monograph.theserverless.dev)).

## What this is

A portfolio **and** a self-hosted CMS on a single Cloudflare Worker:

- **Astro SSR** renders the site; **[teenybase](https://teenybase.com)** provides the
  API, auth, and admin — both in one Worker, sharing one D1 database + R2 bucket.
- Every region of the site (hero, about, experience, projects, skills, education,
  contact, **plus colors, fonts, and icons**) is editable from `/admin` — no code or
  redeploys. Each section can be **shown/hidden**, projects can carry a **cover
  image**, and icons are picked from a **built-in gallery**. Edits save as
  **drafts**, you **Preview** them, then **Publish**.
- Content lives in D1 and is read during SSR. The committed `src/data/*.yaml` is the
  **seed** and the fallback, so a fresh clone always renders.
- There's a Markdown **blog** at `/blog` and a **links feed** at `/links`, both
  managed from the admin, with **RSS** (`/rss.xml`, `/links.xml`). The home page
  teases the most recent of each.
- Every project gets a **detail page** at `/projects/<slug>` (slug + markdown
  write-up editable in the admin; slugs derive from titles by default), and
  `/cv` renders a **print-ready résumé** from the same content.
- **Open Graph cards** are generated on the Worker (satori + resvg wasm) at
  `/og/...` for every page, post, and project, using the theme's font and colors.

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

This repo is the [Astro Monograph + teenybase](https://github.com/theserverlessdev/astro-monograph-teenybase)
template. It can also publish a **CMS-free, YAML-only** static variant — the plain
[Astro Monograph](https://github.com/theserverlessdev/astro-monograph) theme — via
`publish-theme.sh`:

```bash
npm run theme:dry   # build the stripped static theme to /tmp/astro-monograph (no push)
npm run theme       # build and push to the theme remote
```

## License

Source code is MIT, derived from the [Astro Monograph + teenybase](https://github.com/theserverlessdev/astro-monograph-teenybase) template. Personal content is all rights reserved — see [LICENSE](LICENSE).
