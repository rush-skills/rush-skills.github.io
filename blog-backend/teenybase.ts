import {
    type DatabaseSettings,
    type TableAuthExtensionData,
    type TableRulesExtensionData,
} from 'teenybase'
import {
    baseFields,
    authFields,
    createdTrigger,
    updatedTrigger,
} from 'teenybase/scaffolds/fields'

// Data model for anks.in — blog now, the rest of the site's content next.
// This config is imported by the single anks.in Worker (src/server/teeny.ts),
// which mounts the teenybase API at /api/* alongside the Astro pages. There is
// no separate backend service; site and API share one D1 + R2.
//
// appUrl drives auth email/redirect links. Same-origin in production, so CORS is
// moot; override via APP_URL for local dev.
export default {
    // Same-origin in production (single Worker), so CORS is moot; this mainly
    // affects auth email/redirect links. Overridable via APP_URL for local dev.
    appUrl: (typeof process !== 'undefined' && process.env?.APP_URL) || 'https://anks.in',
    jwtSecret: '$JWT_SECRET',
    tables: [
        // --- Authors / admin users -------------------------------------------------
        {
            name: 'users',
            autoSetUid: true,
            fields: [...baseFields, ...authFields],
            triggers: [createdTrigger, updatedTrigger],
            extensions: [
                {
                    name: 'auth',
                    passwordType: 'sha256',
                    jwtSecret: '$JWT_SECRET_USERS',
                    jwtTokenDuration: 3600,
                    maxTokenRefresh: 5,
                    passwordConfirmSuffix: 'Confirm',
                } as TableAuthExtensionData,
                {
                    // Self-serve signup is closed; the owner account is seeded once.
                    name: 'rules',
                    listRule: 'auth.uid == id',
                    viewRule: 'auth.uid == id',
                    createRule: 'auth.admin == true',
                    updateRule: 'auth.uid == id',
                    deleteRule: 'auth.admin == true',
                } as TableRulesExtensionData,
            ],
        },

        // --- Blog posts ------------------------------------------------------------
        {
            name: 'posts',
            autoSetUid: true,
            fields: [
                ...baseFields,
                { name: 'author_id', type: 'relation', sqlType: 'text', notNull: true, foreignKey: { table: 'users', column: 'id' } },
                { name: 'title', type: 'text', sqlType: 'text', notNull: true },
                { name: 'slug', type: 'text', sqlType: 'text', notNull: true, unique: true },
                { name: 'excerpt', type: 'text', sqlType: 'text' },
                { name: 'cover_image', type: 'file', sqlType: 'text' },
                // Markdown source authored in the /admin editor.
                { name: 'body', type: 'text', sqlType: 'text', notNull: true },
                // JSON array of tag strings (sqlType must be 'text').
                { name: 'tags', type: 'json', sqlType: 'text' },
                { name: 'published', type: 'bool', sqlType: 'boolean' },
                { name: 'published_at', type: 'date', sqlType: 'timestamp' },
            ],
            triggers: [createdTrigger, updatedTrigger],
            indexes: [{ fields: 'slug' }, { fields: 'published' }, { fields: 'author_id' }],
            extensions: [
                {
                    // Public can read published posts; authors manage their own.
                    name: 'rules',
                    listRule: 'published == true | auth.uid == author_id',
                    viewRule: 'published == true | auth.uid == author_id',
                    createRule: 'auth.uid != null & author_id == auth.uid',
                    updateRule: 'auth.uid == author_id',
                    deleteRule: 'auth.uid == author_id',
                } as TableRulesExtensionData,
            ],
        },

        // --- Site content (CMS) ----------------------------------------------------
        // Every editable region of the site is one row here, keyed by `section`
        // (hero, about, projects, theme, …). Each row carries two JSON snapshots:
        //   - `published`: what the live site renders
        //   - `draft`:     the work-in-progress shown in admin Preview
        // "Publish" copies draft -> published. The public site reads the published
        // column straight from D1 during SSR (see src/lib/content.ts), so drafts are
        // never exposed: the HTTP API below is locked to authenticated admins only.
        {
            name: 'content',
            autoSetUid: true,
            fields: [
                ...baseFields,
                { name: 'section', type: 'text', sqlType: 'text', notNull: true, unique: true },
                { name: 'draft', type: 'json', sqlType: 'text' },
                { name: 'published', type: 'json', sqlType: 'text' },
            ],
            triggers: [createdTrigger, updatedTrigger],
            indexes: [{ fields: 'section' }],
            extensions: [
                {
                    // Admin-only: SSR reads D1 directly, so nothing here is public.
                    name: 'rules',
                    listRule: 'auth.uid != null',
                    viewRule: 'auth.uid != null',
                    createRule: 'auth.uid != null',
                    updateRule: 'auth.uid != null',
                    deleteRule: 'auth.uid != null',
                } as TableRulesExtensionData,
            ],
        },
    ],
} satisfies DatabaseSettings
