// Migration-generation scaffold only. The live Worker is the Astro app at the
// repo root (src/server/teeny.ts builds the same teenybase app and mounts it at
// /api/*). This file exists because `teeny generate` requires a worker `main`.
import { $Database, $Env, OpenApiExtension, PocketUIExtension, D1Adapter, teenyHono } from 'teenybase/worker'
import config from 'virtual:teenybase'

type Env = $Env & { Bindings: CloudflareBindings }

const app = teenyHono<Env>(async (c) => {
    const db = new $Database(c, config, new D1Adapter(c.env.PRIMARY_DB))
    db.extensions.push(new OpenApiExtension(db, true))
    db.extensions.push(new PocketUIExtension(db))
    return db
})

export default app
