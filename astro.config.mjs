import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://anks.in',
  // Default '/' for production; PR-preview builds set PREVIEW_BASE=/pr-preview/pr-N/
  // so bundled assets resolve under the preview subdirectory on gh-pages.
  base: process.env.PREVIEW_BASE || '/',
  output: 'static',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
