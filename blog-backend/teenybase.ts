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

// Backend for anks.in — blog + (later) the rest of the site's content.
// Deployed as its own Cloudflare Worker at https://anksinblog.theserverless.dev
// The public site (anks.in) reads from this over the REST API at /api/v1.
//
// appUrl drives CORS + auth-cookie/redirect behavior, so it must be the
// public site origin in production. Override via the APP_URL var in wrangler.
export default {
    appUrl: process.env.APP_URL || 'http://localhost:8787',
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
    ],
} satisfies DatabaseSettings
