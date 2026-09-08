import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'

export type Cart = Record<string, number> // productId -> quantity

const COOKIE = 'cart'

export const readCart = (c: Context): Cart => {
  const raw = getCookie(c, COOKIE)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch { }
  return {}
}

export const writeCart = (c: Context, cart: Cart) => {
  const entries = Object.entries(cart).filter(([, qty]) => qty > 0)
  if (entries.length === 0) {
    deleteCookie(c, COOKIE, { path: '/' })
    return
  }
  setCookie(c, COOKIE, JSON.stringify(Object.fromEntries(entries)), {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export const cartCount = (cart: Cart) => Object.values(cart).reduce((sum, qty) => sum + qty, 0)
