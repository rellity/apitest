import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { compress } from 'hono/compress'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { shopController } from './controllers/shop'
import { adminController } from './controllers/admin'
import { apiController } from './controllers/api'

const app = new Hono()
  .use('/*', compress())
  // CSRF only matters where the browser sends credentials automatically
  // (cookies). The API uses Authorization headers, which it never auto-sends.
  .use('/shop/*', csrf())
  .use('/admin/*', csrf())
  .use('/*', serveStatic({ root: './public' }))
  .get('/', (c) => c.redirect('/shop'))
  .route('/shop', shopController)
  .route('/admin', adminController)
  .route('/api/v1', apiController)

// API clients expect JSON even for errors; browsers get the default pages.
const isApi = (path: string) => path.startsWith('/api/')
app.notFound((c) => (isApi(c.req.path) ? c.json({ error: { code: 'not_found', message: 'No such route.' } }, 404) : c.text('Not Found', 404)))
app.onError((err, c) => {
  // Deliberate HTTP errors (like csrf's 403) already carry their response.
  if (err instanceof HTTPException) return err.getResponse()
  console.error(err)
  // Never send err.message to the client: it can contain SQL or file paths.
  return isApi(c.req.path)
    ? c.json({ error: { code: 'internal', message: 'Something went wrong.' } }, 500)
    : c.text('Internal Server Error', 500)
})

export default app
