// CMS section schemas. Each entry describes one row of the `content` table (one
// editable region of the public site) as a tree of fields, so the admin can
// render a real form — nested groups, repeatable lists, colors, icons — instead
// of raw JSON. Shapes mirror src/data/*.yaml exactly; SectionForm walks these.

export type SecFieldType =
  | 'text'
  | 'textarea'
  | 'color'
  | 'icon'
  | 'select'
  | 'boolean'
  | 'number'
  | 'tags'
  | 'image'
  | 'group'        // fixed-key nested object
  | 'list'         // repeatable array of objects (of `fields`)
  | 'textlist'     // repeatable array of strings
  | 'richtext'     // constrained WYSIWYG -> sanitized HTML (bold/italic/link)
  | 'richtextlist'; // repeatable array of rich-text HTML strings

export interface SecField {
  name: string;
  label?: string;
  type: SecFieldType;
  help?: string;
  placeholder?: string;
  options?: string[];        // select
  fields?: SecField[];       // group / list item shape
  itemLabel?: string;        // singular noun for list "Add X" / item headers
  itemTitleKey?: string;     // which sub-field to show in a list item's header
}

export interface SectionDef {
  section: string;           // content.section key (and src/data/<section>.yaml)
  label: string;             // sidebar + page title
  icon: string;              // lord-icon hash (nav decoration only)
  description?: string;
  fields: SecField[];
}

// Small builders to keep the schema readable.
const t = (name: string, label?: string, extra: Partial<SecField> = {}): SecField => ({ name, label, type: 'text', ...extra });
const area = (name: string, label?: string, extra: Partial<SecField> = {}): SecField => ({ name, label, type: 'textarea', ...extra });
const icon = (name = 'icon', label = 'Icon'): SecField => ({ name, label, type: 'icon', help: 'Lordicon hash (e.g. tsrgicte). Browse at lordicon.com.' });
const color = (name: string, label?: string): SecField => ({ name, label, type: 'color' });

const linkFields: SecField[] = [t('label', 'Label'), t('url', 'URL'), icon()];
const ctaGroup = (name: string, label: string): SecField => ({
  name, label, type: 'group',
  fields: [t('label', 'Label'), t('href', 'Link'), icon()],
});

export const SECTION_DEFS: SectionDef[] = [
  {
    section: 'site',
    label: 'Site & Nav',
    icon: 'msoeawqm',
    description: 'Name, SEO metadata, navigation, and social links.',
    fields: [
      t('name', 'Brand name', { help: 'Shown in the navbar.' }),
      t('fullName', 'Full name'),
      t('title', 'SEO title'),
      area('description', 'SEO description'),
      t('email', 'Contact email'),
      t('lang', 'Language', { placeholder: 'en' }),
      color('themeColor', 'Browser theme color'),
      { name: 'ogImage', label: 'OG / social image', type: 'image', help: 'Used for link previews.' },
      {
        name: 'nav', label: 'Navigation', type: 'list', itemLabel: 'link', itemTitleKey: 'label',
        fields: [t('label', 'Label'), t('href', 'Link', { help: '#section or /path' }), icon()],
      },
      {
        name: 'social', label: 'Social links', type: 'list', itemLabel: 'link', itemTitleKey: 'label',
        fields: [t('label', 'Label'), t('url', 'URL'), icon()],
      },
    ],
  },
  {
    section: 'theme',
    label: 'Theme & Colors',
    icon: 'rODHGiqE',
    description: 'Re-skin the whole site. Colors override the stylesheet at render time; fonts are loaded from Google Fonts.',
    fields: [
      {
        name: 'light', label: 'Light mode', type: 'group',
        fields: [color('accent', 'Accent'), color('accent-light', 'Accent (light)'), color('accent-dark', 'Accent (dark)'), t('accent-wash', 'Accent wash', { help: 'Faint tint, e.g. #EBF0F9' })],
      },
      {
        name: 'dark', label: 'Dark mode', type: 'group',
        fields: [color('accent', 'Accent'), color('accent-light', 'Accent (light)'), color('accent-dark', 'Accent (dark)'), t('accent-wash', 'Accent wash', { help: 'e.g. rgba(123,164,224,0.1)' })],
      },
      {
        name: 'fonts', label: 'Fonts', type: 'group',
        fields: [t('display', 'Display font', { help: 'Google Fonts family name' }), t('sans', 'Body font'), t('mono', 'Mono font')],
      },
    ],
  },
  {
    section: 'hero',
    label: 'Hero',
    icon: 'srupsmbe',
    description: 'The top of the home page.',
    fields: [
      t('subtitle', 'Eyebrow / subtitle'),
      t('name', 'Headline'),
      icon('icon', 'Headline icon'),
      area('description', 'Intro paragraph'),
      {
        name: 'cta', label: 'Call-to-action buttons', type: 'group',
        fields: [ctaGroup('viewWork', 'Primary button'), ctaGroup('getInTouch', 'Secondary link')],
      },
    ],
  },
  {
    section: 'about',
    label: 'About',
    icon: 'kdduutaw',
    fields: [
      t('label', 'Eyebrow'),
      t('heading', 'Heading'),
      { name: 'paragraphs', label: 'Paragraphs', type: 'richtextlist', help: 'One box per paragraph. Use Bold, Italic, or Link — formatting is kept simple on purpose.' },
      {
        name: 'stats', label: 'Stats', type: 'list', itemLabel: 'stat', itemTitleKey: 'label',
        fields: [icon(), t('value', 'Value'), t('label', 'Label')],
      },
    ],
  },
  {
    section: 'experience',
    label: 'Experience',
    icon: 'zhiiqoue',
    fields: [
      t('label', 'Eyebrow'),
      t('heading', 'Heading'),
      {
        name: 'jobs', label: 'Jobs', type: 'list', itemLabel: 'job', itemTitleKey: 'company',
        fields: [
          t('company', 'Company'), t('role', 'Role'), t('url', 'Company URL'),
          t('location', 'Location'), t('dateRange', 'Date range'),
          area('description', 'Description'),
          { name: 'tech', label: 'Tech', type: 'tags' },
        ],
      },
    ],
  },
  {
    section: 'projects',
    label: 'Projects',
    icon: 'tsrgicte',
    fields: [
      t('label', 'Eyebrow'),
      t('heading', 'Heading'),
      {
        name: 'statuses', label: 'Status filters', type: 'list', itemLabel: 'status', itemTitleKey: 'label',
        help: 'The filter pills. "All" needs no color.',
        fields: [t('label', 'Label'), color('color', 'Color')],
      },
      {
        name: 'items', label: 'Projects', type: 'list', itemLabel: 'project', itemTitleKey: 'title',
        fields: [
          icon(), t('title', 'Title'), t('subtitle', 'Subtitle'),
          t('status', 'Status', { help: 'Must match a status label above.' }),
          { name: 'featured', label: 'Featured', type: 'boolean' },
          area('description', 'Description'),
          { name: 'tech', label: 'Tech', type: 'tags' },
          {
            name: 'links', label: 'Links', type: 'list', itemLabel: 'link', itemTitleKey: 'label',
            fields: linkFields,
          },
        ],
      },
    ],
  },
  {
    section: 'skills',
    label: 'Skills',
    icon: 'fwkrbvja',
    fields: [
      t('label', 'Eyebrow'),
      t('heading', 'Heading'),
      {
        name: 'categories', label: 'Categories', type: 'list', itemLabel: 'category', itemTitleKey: 'name',
        fields: [icon(), t('name', 'Category'), { name: 'items', label: 'Skills', type: 'tags' }],
      },
    ],
  },
  {
    section: 'education',
    label: 'Education',
    icon: 'vvyxyrur',
    fields: [
      t('label', 'Eyebrow'),
      t('heading', 'Heading'),
      {
        name: 'schools', label: 'Education', type: 'list', itemLabel: 'qualification', itemTitleKey: 'degree',
        fields: [
          t('degree', 'Degree'),
          t('institution', 'Institution'),
          t('dateRange', 'Date range'),
          {
            name: 'highlights', label: 'Highlights', type: 'list', itemLabel: 'highlight', itemTitleKey: 'text',
            fields: [icon(), t('text', 'Text'), { name: 'featured', label: 'Featured', type: 'boolean' }],
          },
        ],
      },
    ],
  },
  {
    section: 'contact',
    label: 'Contact & Footer',
    icon: 'ozlkyfxg',
    fields: [
      t('label', 'Eyebrow'),
      t('heading', 'Heading'),
      area('description', 'Description'),
      icon('emailIcon', 'Email icon'),
      {
        name: 'cta', label: 'Buttons', type: 'list', itemLabel: 'button', itemTitleKey: 'label',
        fields: [t('label', 'Label'), t('href', 'Link'), icon()],
      },
      {
        name: 'footer', label: 'Footer', type: 'group',
        fields: [{ name: 'copyright', label: 'Copyright', type: 'richtext', help: 'Use Bold / Italic / Link.' }, t('iconsAttribution', 'Icons attribution'), t('iconsUrl', 'Icons URL')],
      },
    ],
  },
];

export function getSectionDef(section: string): SectionDef | undefined {
  return SECTION_DEFS.find((s) => s.section === section);
}
