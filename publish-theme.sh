#!/usr/bin/env bash
#
# Publishes the Astro Monograph theme to a separate git repo.
#
# This script:
#   1. Copies the entire project to a temp directory
#   2. Replaces src/data/ with example-data/ placeholder content, then removes example-data/
#   3. Removes personal files (CNAME, resume PDF, privacy/terms)
#   4. Updates config for generic use
#   5. Pushes to the "theme" remote
#
# Setup (one-time):
#   git remote add theme git@github.com:theserverlessdev/astro-monograph.git
#
# Usage:
#   ./publish-theme.sh            # builds and pushes to theme remote
#   ./publish-theme.sh --dry-run  # builds to /tmp/astro-monograph without pushing

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
THEME_DIR="/tmp/astro-monograph"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

echo "==> Preparing Astro Monograph theme export..."

# Clean and copy
rm -rf "$THEME_DIR"
mkdir -p "$THEME_DIR"

# Copy all tracked files (respects .gitignore, skips node_modules/dist)
cd "$REPO_DIR"
git ls-files -z | xargs -0 -I{} bash -c 'mkdir -p "'"$THEME_DIR"'/$(dirname "{}")" && cp "{}" "'"$THEME_DIR"'/{}"'

echo "==> Swapping personal data with example data..."

# Replace src/data/ with example-data/ contents, then remove example-data/
rm -rf "$THEME_DIR/src/data"
mkdir -p "$THEME_DIR/src/data"
cp "$REPO_DIR/example-data"/*.yaml "$THEME_DIR/src/data/"
rm -rf "$THEME_DIR/example-data"

echo "==> Removing personal files..."

# Remove personal assets
rm -f "$THEME_DIR/public/CNAME"
rm -f "$THEME_DIR/public/Resume_AnkurSingh.pdf"
rm -f "$THEME_DIR/public/privacy.html"
rm -f "$THEME_DIR/public/terms.html"
rm -f "$THEME_DIR/PRD.md"

# Replace robots.txt with generic one
cat > "$THEME_DIR/public/robots.txt" << 'TXT'
User-agent: *
Allow: /
TXT

# Replace favicon with generic one
cat > "$THEME_DIR/public/favicon.svg" << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="#2E5090"/>
  <text x="16" y="22" text-anchor="middle" font-family="monospace" font-weight="700" font-size="14" fill="white">AM</text>
</svg>
SVG

# Replace personal OG image with theme OG image
cp "$REPO_DIR/example-data/og.png" "$THEME_DIR/public/og.png" 2>/dev/null || rm -f "$THEME_DIR/public/og.png"

# Update astro.config.mjs for theme demo on GitHub Pages
cat > "$THEME_DIR/astro.config.mjs" << 'CONF'
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://monograph.theserverless.dev',
  output: 'static',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
CONF

# Update package.json for the theme
cd "$THEME_DIR"
cat > package.json << 'JSON'
{
  "name": "astro-monograph",
  "type": "module",
  "version": "1.0.0",
  "description": "A clean, YAML-driven single-page portfolio theme for Astro. No CMS, no database — just edit YAML files and deploy.",
  "author": "Ankur Singh <hello@anks.in> (https://anks.in)",
  "homepage": "https://github.com/theserverlessdev/astro-monograph",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/theserverlessdev/astro-monograph.git"
  },
  "bugs": {
    "url": "https://github.com/theserverlessdev/astro-monograph/issues"
  },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro"
  },
  "keywords": [
    "astro",
    "astro-theme",
    "portfolio",
    "resume",
    "personal-site",
    "tailwindcss",
    "yaml",
    "single-page",
    "developer-portfolio"
  ],
  "license": "MIT",
  "dependencies": {
    "@tailwindcss/vite": "^4.2.2",
    "astro": "^6.0.8",
    "js-yaml": "^4.1.1",
    "tailwindcss": "^4.2.2"
  },
  "devDependencies": {
    "@astrojs/sitemap": "^3.7.1"
  }
}
JSON

# Update LICENSE — clean MIT
cat > LICENSE << 'LIC'
MIT License

Copyright (c) 2026 Ankur Singh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
LIC

# Update deploy workflow to use main branch
sed -i '' 's/branches: \[master\]/branches: [main]/' "$THEME_DIR/.github/workflows/deploy.yml"

# Remove publish script itself from the theme
rm -f "$THEME_DIR/publish-theme.sh"

# Write theme README
cat > "$THEME_DIR/README.md" << 'README'
# Astro Monograph

A clean, minimal, single-page portfolio theme for [Astro](https://astro.build). All content is driven by YAML files — edit your data, deploy, done.

**[Live Demo](https://monograph.theserverless.dev)**

![Astro Monograph](https://img.shields.io/badge/astro-v6-blue?logo=astro) ![Tailwind](https://img.shields.io/badge/tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **YAML-driven content** — no CMS, no markdown, no database
- **Astro v6** — static site generation, zero client JS by default
- **Tailwind CSS v4** — utility-first styling with a custom design system
- **Lord Icon animations** — animated icons with morph triggers and scroll-reveal
- **Light & dark mode** — follows system preference by default, with a manual toggle; fully customizable color palettes for both modes
- **Scroll-triggered reveals** — smooth fade-in animations as you scroll
- **Mobile responsive** — looks great on all screen sizes
- **Accessible** — semantic HTML, keyboard navigation, `prefers-reduced-motion` support
- **SEO optimized** — JSON-LD structured data, Open Graph, Twitter cards, sitemap, canonical URLs, meta generator tag
- **One-command deploy** — GitHub Pages workflow included; works with Vercel/Netlify out of the box

## Quick Start

```bash
git clone https://github.com/theserverlessdev/astro-monograph.git my-portfolio
cd my-portfolio
npm install
npm run dev
```

Open `src/data/` and replace the placeholder content with your own.

## Content Structure

All text content lives in YAML files under `src/data/`:

| File | What it controls |
|------|-----------------|
| `site.yaml` | Site title, description, name, email, social links, nav items, OG image, theme color |
| `hero.yaml` | Hero section — subtitle, name, description, CTAs |
| `about.yaml` | About section — bio paragraphs, stat cards |
| `experience.yaml` | Work timeline — companies, roles, dates, tech stacks |
| `projects.yaml` | Project cards — with status filtering and expand/collapse |
| `skills.yaml` | Categorized skill tags |
| `education.yaml` | Degree, institution, highlights |
| `contact.yaml` | Contact CTA text, email icon, footer attribution |

## Customization

### Dark Mode

The theme supports light mode, dark mode, and system preference (the default). On first visit the site follows the user's OS setting. A toggle in the navbar lets visitors switch manually — their choice is saved in `localStorage`.

### Colors

Every color used in the theme is defined as a CSS custom property in `src/styles/global.css`. The `@theme` block sets the light-mode palette, and the `.dark` block overrides it for dark mode. To change the look of either mode, update these variables:

```css
/* Light mode (default) */
@theme {
  --color-ink: #1A1D23;              /* primary text */
  --color-ink-secondary: #4A5060;    /* secondary text */
  --color-ink-tertiary: #8890A0;     /* muted text */
  --color-ink-on-dark: #FFFFFF;      /* text on accent backgrounds */
  --color-ink-on-dark-secondary: rgba(255, 255, 255, 0.75);

  --color-surface: #FAFBFC;          /* page background */
  --color-surface-raised: #FFFFFF;   /* cards */
  --color-surface-sunken: #F3F4F6;   /* alternate section background */
  --color-surface-alt: #F0F2F5;      /* misc surfaces */

  --color-accent: #2E5090;           /* main accent */
  --color-accent-light: #3A6BC5;     /* hover state */
  --color-accent-dark: #103877;      /* dark variant */
  --color-accent-wash: #EBF0F9;      /* light tint for tags/badges */

  --color-border: #E2E5EB;           /* default borders */
  --color-border-strong: #C8CDD6;    /* emphasized borders */

  --color-accent-green: #2D8A56;     /* status: live/active */
  --color-accent-amber: #C4820E;     /* status: in-progress */
}

/* Dark mode */
.dark {
  --color-ink: #D8DBE5;
  --color-ink-secondary: #939BB0;
  --color-ink-tertiary: #5C6478;
  --color-ink-on-dark: #FFFFFF;
  --color-ink-on-dark-secondary: rgba(255, 255, 255, 0.75);

  --color-surface: #101218;
  --color-surface-raised: #181B24;
  --color-surface-sunken: #0C0E13;
  --color-surface-alt: #14171F;

  --color-accent: #7BA4E0;
  --color-accent-light: #9BBAEA;
  --color-accent-dark: #5A86C8;
  --color-accent-wash: rgba(123, 164, 224, 0.1);

  --color-border: #242836;
  --color-border-strong: #343848;

  --color-accent-green: #5EC992;
  --color-accent-amber: #E8A838;
}
```

All components reference these variables — changing them recolors the entire site for the corresponding mode. Lord Icon colors are also synced automatically.

### Fonts

Three font families loaded from Google Fonts (configured in `BaseLayout.astro`):

- **Space Grotesk** — display/headings
- **JetBrains Mono** — monospace/code/labels
- **IBM Plex Sans** — body text

### Icons

Icons use [Lord Icon](https://lordicon.com/) with morph animation triggers. Each is referenced by a hash in the YAML files. Browse [lordicon.com/icons](https://lordicon.com/icons) to find new ones — grab the hash from the CDN URL.

### SEO

- Set `site` in `astro.config.mjs` to your domain for canonical URLs and sitemap
- Set `ogImage` in `site.yaml` to the path of your Open Graph image (e.g. `/og.png`)
- Set `themeColor` in `site.yaml` for the browser theme color
- JSON-LD structured data is auto-generated from your YAML content

### Favicon

Replace `public/favicon.svg` with your own.

## Project Structure

```
src/
├── components/       # Navbar, Hero, About, Experience, Projects,
│                     # Skills, Education, Contact, Footer
├── data/             # YAML content files (edit these!)
├── layouts/          # BaseLayout with SEO head, scroll reveal, icon system
├── lib/              # Shared data loader and helpers
├── pages/            # index.astro — composes all components
└── styles/           # global.css (Tailwind theme, animations)
public/
├── favicon.svg
└── robots.txt
```

## Deployment

Update `astro.config.mjs` before deploying:

```js
export default defineConfig({
  site: 'https://yourdomain.com',  // your domain
  // base: '/repo-name',           // add this if deploying to a subpath (e.g. GitHub Pages without custom domain)
});
```

### GitHub Pages

The included `.github/workflows/deploy.yml` deploys on push to `main`.
Enable GitHub Pages: Settings → Pages → Source: GitHub Actions.

If you're not using a custom domain, set `base: '/your-repo-name'` in `astro.config.mjs`.

### Vercel / Netlify / Cloudflare Pages

Connect your repo — all auto-detect Astro projects. No configuration needed.

### Custom Domain

Set `site` to your domain and remove `base` (or set it to `'/'`).

## License

MIT — see [LICENSE](LICENSE).

## Credits

Built with [Astro](https://astro.build), styled with [Tailwind CSS](https://tailwindcss.com), icons by [Lord Icon](https://lordicon.com).

Created by [Ankur Singh](https://anks.in).
README

echo "==> Theme prepared at $THEME_DIR"

# Verify it builds
echo "==> Verifying build..."
cd "$THEME_DIR"
npm install --silent 2>&1 | tail -1
npm run build 2>&1 | tail -3

if $DRY_RUN; then
  echo ""
  echo "==> Dry run complete. Theme is at: $THEME_DIR"
  echo "    Inspect it, then run without --dry-run to push."
else
  # Initialize and push
  cd "$THEME_DIR"
  git init
  git add -A
  git commit -m "Update Astro Monograph theme"

  # Try to push to theme remote
  THEME_REMOTE=$(cd "$REPO_DIR" && git remote get-url theme 2>/dev/null || echo "")
  if [ -n "$THEME_REMOTE" ]; then
    git remote add origin "$THEME_REMOTE"
    echo ""
    echo "==> Pushing to $THEME_REMOTE ..."
    git push -f origin main
    echo "==> Done! Astro Monograph published."
  else
    echo ""
    echo "==> No 'theme' remote found. Set one up:"
    echo "    cd $REPO_DIR && git remote add theme <your-theme-repo-url>"
    echo "    Then re-run this script."
  fi
fi
