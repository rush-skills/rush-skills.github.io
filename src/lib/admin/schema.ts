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
    listColumns: ['title', 'published', 'published_at'],
    titleField: 'title',
    defaultOrder: 'created desc',
    enabled: true,
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'Post title' },
      { name: 'slug', label: 'Slug', type: 'slug', required: true, slugFrom: 'title', help: 'URL path: /blog/<slug>' },
      { name: 'excerpt', label: 'Excerpt', type: 'textarea', placeholder: 'One or two sentence summary shown in the list.' },
      { name: 'cover_image', label: 'Cover image', type: 'image', help: 'Optional. Drag an image or paste a URL.' },
      { name: 'body', label: 'Body', type: 'markdown', required: true },
      { name: 'tags', label: 'Tags', type: 'tags', help: 'Comma or Enter to add.' },
      { name: 'published', label: 'Published', type: 'boolean' },
      { name: 'published_at', label: 'Publish date', type: 'datetime', help: 'Defaults to now when first published.' },
    ],
  },
];

export function entityByKey(key: string): EntityDef | undefined {
  return ENTITIES.find((e) => e.key === key);
}
