import { sql } from 'drizzle-orm'
import app from '../../src/index'
import { db } from '../../src/db'
import { users, type Role } from '../../src/db/schema'
import { SessionModel } from '../../src/models/user'
import { resetMemoryLimits } from '../../src/lib/limits'

export const resetDb = () => {
  resetMemoryLimits() // in-memory rate limiters; the rate_limits table is truncated below
  return db.execute(sql`truncate users, sessions, api_tokens, rate_limits, products, orders, order_items restart identity cascade`)
}

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
export const request = (
  path: string,
  init: { method?: string; cookie?: string; form?: Record<string, string>; json?: unknown } = {},
) =>
  app.request(path, {
    method: init.method ?? (init.form ? 'POST' : 'GET'),
    headers: {
      origin: 'http://localhost',
      ...(init.cookie && { cookie: init.cookie }),
      ...(init.form && { 'content-type': 'application/x-www-form-urlencoded' }),
      ...(init.json !== undefined && { 'content-type': 'application/json' }),
    },
    body: init.form ? new URLSearchParams(init.form) : init.json !== undefined ? JSON.stringify(init.json) : undefined,
  })
