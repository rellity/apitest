import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { compress } from 'hono/compress'
import { csrf } from 'hono/csrf'
import { shopController } from './controllers/shop'

const app = new Hono()
  .use('/*', compress())
  .use('/*', csrf())
  .use('/*', serveStatic({ root: './public' }))
  .get('/', (c) => c.redirect('/shop'))
  .route('/shop', shopController)

export default app
