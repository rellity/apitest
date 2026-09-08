import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { shopController } from './controllers/shop'

const app = new Hono()
  .use('/*', serveStatic({ root: './public' }))
  .get('/', (c) => c.redirect('/shop'))
  .route('/shop', shopController)

export default app
