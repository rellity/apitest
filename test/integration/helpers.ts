import { sql } from 'drizzle-orm'
import app from '../../src/index'
import { db } from '../../src/db'
import { users, type Role } from '../../src/db/schema'
import { SessionModel } from '../../src/models/user'

export const resetDb = () =>
  db.execute(sql`truncate users, sessions, api_tokens, products, orders, order_items restart identity cascade`)

let n = 0
export const createUser = async (role: Role = 'buyer') => {
  const [user] = await db
    .insert(users)
    .values({ name: 'Test', email: `user${++n}@example.com`, passwordHash: 'x', role })
    .returning()
  return user!
}

// A logged-in cookie without going through the login form.
export const sessionCookie = async (userId: number) => `session=${await SessionModel.create(userId)}`

// app.request runs the whole Hono app in-process: middleware, routing, views.
// No server, no port. Origin is set because the csrf() middleware checks it.
export const request = (path: string, init: { method?: string; cookie?: string; form?: Record<string, string> } = {}) =>
  app.request(path, {
    method: init.method ?? (init.form ? 'POST' : 'GET'),
    headers: {
      origin: 'http://localhost',
      ...(init.cookie && { cookie: init.cookie }),
      ...(init.form && { 'content-type': 'application/x-www-form-urlencoded' }),
    },
    body: init.form && new URLSearchParams(init.form),
  })
