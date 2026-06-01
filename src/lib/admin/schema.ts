// Table-backed collections for the admin (currently just the blog). Repeating
// homepage content (projects, experience, skills, education) is managed through
// the rich section editors in sections.ts instead of separate tables, so it does
// NOT appear here — see SECTION_DEFS + the "Collections" group in app.ts.

export type FieldType =
  | 'text'
  | 'textarea'
  | 'markdown'
  | 'slug'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'tags'
  | 'image'
  | 'json'
  | 'select';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: string[]; // for select
  // derive this field's value from another (e.g. slug from title) when empty
  slugFrom?: string;
  // hide in the list table
  hideInList?: boolean;
  // don't send to the API on save (computed/display only)
  readOnly?: boolean;
}

export interface EntityDef {
  /** teenybase table name */
  table: string;
  /** url key under /admin/ */
  key: string;
  labelSingular: string;
  labelPlural: string;
  icon: string; // lord-icon hash
  /** columns shown in the list view (field names) */
  listColumns: string[];
  /** field shown as the row title / link text */
  titleField: string;
  /** default ordering for the list query */
  defaultOrder?: string;
  fields: FieldDef[];
  /** values injected on create (e.g. author_id, published_at) handled in code */
  enabled: boolean;
}

export const ENTITIES: EntityDef[] = [
  {
    table: 'posts',
    key: 'posts',
    labelSingular: 'Post',
    labelPlural: 'Blog Posts',
    icon: 'wxnxiano',
    listColumns: ['title', 'published', 'published_at', 'ai_generated'],
    titleField: 'title',
    defaultOrder: 'published_at desc',
    enabled: true,
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'Post title' },
      { name: 'slug', label: 'Slug', type: 'slug', required: true, slugFrom: 'title', help: 'URL path: /blog/<slug>' },
      { name: 'excerpt', label: 'Excerpt', type: 'textarea', placeholder: 'One or two sentence summary shown in the list.' },
      { name: 'cover_image', label: 'Cover image', type: 'image', help: 'Optional. Drag an image or paste a URL.' },
      { name: 'body', label: 'Body', type: 'markdown', required: true },
      { name: 'tags', label: 'Tags', type: 'tags', help: 'Comma or Enter to add.' },
      { name: 'published', label: 'Published', type: 'boolean' },
      { name: 'published_at', label: 'Publish date', type: 'datetime', help: 'Drives ordering + the displayed date. Set it in the past to back-date a post into the timeline.' },
      { name: 'ai_generated', label: 'AI-assisted', type: 'boolean', help: 'Shows an "AI-assisted" badge on the post.' },
    ],
  },
  {
    table: 'links',
    key: 'links',
    labelSingular: 'Link',
    labelPlural: 'Links',
    icon: 'hmqxevgf',
    listColumns: ['title', 'kind', 'published', 'published_at'],
    titleField: 'title',
    defaultOrder: 'published_at desc',
    enabled: true,
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'What is this link?' },
      { name: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://…' },
      { name: 'kind', label: 'Kind', type: 'select', options: ['article', 'video', 'bookmark', 'repo'] },
      { name: 'note', label: 'Note', type: 'textarea', help: 'Optional commentary (markdown). Leave blank for a bare link.' },
      { name: 'tags', label: 'Tags', type: 'tags', help: 'Comma or Enter to add.' },
      { name: 'published', label: 'Published', type: 'boolean' },
      { name: 'published_at', label: 'Publish date', type: 'datetime', help: 'Drives feed order. Defaults to now when first published.' },
    ],
  },
];

export function entityByKey(key: string): EntityDef | undefined {
  return ENTITIES.find((e) => e.key === key);
}
