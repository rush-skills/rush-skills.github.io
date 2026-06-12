// Canonical slug derivation, shared by the project detail pages, their cards,
// the sitemap, and the OG routes. Items may set an explicit `slug`; otherwise
// it's derived from the title so existing content gets detail pages without a
// data migration.
export function slugify(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function projectSlug(item: { slug?: string; title?: string }): string {
  return item.slug?.trim() || slugify(item.title || '');
}
