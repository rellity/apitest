import { eq } from 'drizzle-orm'
import { db } from './db'
import { todos } from './schema'

export const Todo = {
  all: () => db.select().from(todos).orderBy(todos.id),
  create: async (title: string) => (await db.insert(todos).values({ title }).returning())[0]!,
  toggle: async (id: number) => {
    const [t] = await db.select().from(todos).where(eq(todos.id, id))
    if (!t) return
    return (await db.update(todos).set({ done: !t.done }).where(eq(todos.id, id)).returning())[0]
  },
  remove: (id: number) => db.delete(todos).where(eq(todos.id, id)),
}
