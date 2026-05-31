// Schema-driven admin: every editable entity is described here once. The /admin
// SPA renders list + form views generically from these definitions, so adding a
// new teenybase table later (projects, experience, ...) is a config change, not
// new UI code.

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
  // --- Phase 2 entities (tables added to teenybase next). Listed but disabled
  // until their tables exist; flip `enabled` once migrated. ------------------
  {
    table: 'projects',
    key: 'projects',
    labelSingular: 'Project',
    labelPlural: 'Projects',
    icon: 'tsrgicte',
    listColumns: ['title', 'status', 'featured'],
    titleField: 'title',
    defaultOrder: 'sort_order asc',
    enabled: false,
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'subtitle', label: 'Subtitle', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'status', label: 'Status', type: 'select', options: ['Live', 'Enterprise', 'Open Source', 'Hackathon Winner', 'WIP', 'Archived'] },
      { name: 'featured', label: 'Featured', type: 'boolean' },
      { name: 'tech', label: 'Tech', type: 'tags' },
      { name: 'links', label: 'Links', type: 'json', help: 'Array of { url, label, icon }.' },
      { name: 'sort_order', label: 'Sort order', type: 'number' },
    ],
  },
  {
    table: 'experience',
    key: 'experience',
    labelSingular: 'Experience',
    labelPlural: 'Experience',
    icon: 'zhiiqoue',
    listColumns: ['company', 'role', 'date_range'],
    titleField: 'company',
    defaultOrder: 'sort_order asc',
    enabled: false,
    fields: [
      { name: 'company', label: 'Company', type: 'text', required: true },
      { name: 'role', label: 'Role', type: 'text', required: true },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'date_range', label: 'Date range', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'tech', label: 'Tech', type: 'tags' },
      { name: 'sort_order', label: 'Sort order', type: 'number' },
    ],
  },
  {
    table: 'education',
    key: 'education',
    labelSingular: 'Education',
    labelPlural: 'Education',
    icon: 'vvyxyrur',
    listColumns: ['degree', 'institution'],
    titleField: 'degree',
    defaultOrder: 'sort_order asc',
    enabled: false,
    fields: [
      { name: 'degree', label: 'Degree', type: 'text', required: true },
      { name: 'institution', label: 'Institution', type: 'text', required: true },
      { name: 'date_range', label: 'Date range', type: 'text' },
      { name: 'highlights', label: 'Highlights', type: 'json', help: 'Array of { text }.' },
      { name: 'sort_order', label: 'Sort order', type: 'number' },
    ],
  },
  {
    table: 'skills',
    key: 'skills',
    labelSingular: 'Skill group',
    labelPlural: 'Skills',
    icon: 'fwkrbvja',
    listColumns: ['name'],
    titleField: 'name',
    defaultOrder: 'sort_order asc',
    enabled: false,
    fields: [
      { name: 'name', label: 'Category', type: 'text', required: true },
      { name: 'items', label: 'Items', type: 'tags' },
      { name: 'sort_order', label: 'Sort order', type: 'number' },
    ],
  },
];

export function entityByKey(key: string): EntityDef | undefined {
  return ENTITIES.find((e) => e.key === key);
}
