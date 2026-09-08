import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'
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
