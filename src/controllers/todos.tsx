import { Hono } from 'hono'
import { Todo } from '../models/todo'
import { Layout } from '../views/layout'
import { TodoItem, TodoList } from '../views/todos'

export const todosController = new Hono()
  .get('/', async (c) =>
    c.html(
      <Layout>
        <TodoList todos={await Todo.all()} />
      </Layout>,
    ),
  )
  .post('/todos', async (c) => {
    const title = String((await c.req.parseBody()).title ?? '').trim()
    if (!title) return c.body(null, 400)
    return c.html(<TodoItem todo={await Todo.create(title)} />)
  })
  .patch('/todos/:id/toggle', async (c) => {
    const t = await Todo.toggle(Number(c.req.param('id')))
    return t ? c.html(<TodoItem todo={t} />) : c.notFound()
  })
  .delete('/todos/:id', async (c) => {
    await Todo.remove(Number(c.req.param('id')))
    return c.body(null)
  })
