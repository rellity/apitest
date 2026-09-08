import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { todosController } from './controllers/todos'
import { counterController } from './controllers/counter'

const app = new Hono()
  .use('/*', serveStatic({ root: './public' }))
  .route('/', todosController)
  .route('/counter', counterController)

export default app
