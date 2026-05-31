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
