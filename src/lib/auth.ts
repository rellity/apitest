import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import type { User } from '../db/schema'
import { SessionModel } from '../models/user'

const COOKIE = 'session'

export const currentUser = (c: Context) => {
  const sessionId = getCookie(c, COOKIE)
  if (!sessionId) return undefined
  return SessionModel.user(sessionId)
}

export const signIn = async (c: Context, userId: number) => {
  const sessionId = await SessionModel.create(userId)
  setCookie(c, COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export const signOut = async (c: Context) => {
  const sessionId = getCookie(c, COOKIE)
  if (sessionId) await SessionModel.destroy(sessionId)
  deleteCookie(c, COOKIE, { path: '/' })
}

// Only same-site paths. "//evil.com" and "/\evil.com" are treated by browsers
// as links to another site, so a plain startsWith('/') is not enough.
export const safeRedirect = (path: string | undefined) => (path && /^\/(?![/\\])/.test(path) ? path : '/shop')

// The Variables type flows into every handler behind this middleware:
// c.var.user is a User there, no undefined check needed.
export type AdminEnv = { Variables: { user: User } }

export const requireAdmin = createMiddleware<AdminEnv>(async (c, next) => {
  const user = await currentUser(c)
  // 401-ish: not logged in, send them to log in and come back.
  if (!user) return c.redirect(`/shop/login?redirect=${encodeURIComponent(c.req.path)}`)
  // 403: logged in but not allowed. Logging in again won't help.
  if (user.role !== 'admin') return c.text('Forbidden', 403)
  c.set('user', user)
  await next()
})
