import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://anks.in',
  // Static by default (marketing pages stay prerendered for SEO/speed); the
  // Cloudflare adapter enables per-route SSR via `export const prerender = false`
  // (used by /blog and, later, /admin). Phase 2 makes the rest dynamic too.
  output: 'static',
  adapter: cloudflare({
    // Expose wrangler.jsonc bindings (D1/R2/vars) to `astro dev` via Miniflare.
    platformProxy: { enabled: true },
  }),
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
