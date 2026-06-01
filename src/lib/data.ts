import yaml from 'js-yaml';

// YAML is inlined at build time via Vite's glob (?raw), so data loading works in
// every environment — Node, Astro's prerender step, and the Cloudflare Worker
// runtime — with no runtime `node:fs` dependency (which the Worker lacks).
const rawFiles = import.meta.glob('../data/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const dataByName: Record<string, string> = {};
for (const [filePath, contents] of Object.entries(rawFiles)) {
  const name = filePath.split('/').pop();
  if (name) dataByName[name] = contents;
}

export function load(file: string): any {
  const contents = dataByName[file];
  if (!contents) return {};
  try {
    return yaml.load(contents) || {};
  } catch {
    return {};
  }
}

// Lord Icon color themes
export const LI = {
  dark: 'primary:#1A1D23,secondary:#2E5090',
  light: 'primary:#ffffff,secondary:#ffffff',
  blue: 'primary:#2E5090,secondary:#2E5090',
};

// Lord Icon CDN URL from hash
export const liSrc = (hash: string) => `https://cdn.lordicon.com/${hash}.json`;

// Strip any baked-in "01 // " or "// " prefix from a section eyebrow. The number
// + separator are re-added by CSS (a counter on `.eyebrow-num`, see global.css)
// so they sequence automatically by position — staying correct no matter the
// order or which sections are hidden.
export const eyebrowText = (s: unknown) =>
  String(s ?? '').replace(/^\s*\d+\s*\/\/\s*/, '').replace(/^\/\/\s*/, '').trim();
