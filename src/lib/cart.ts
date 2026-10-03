import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'

export type Cart = Record<string, number> // productId -> quantity

const COOKIE = 'cart'
const MAX_QTY = 99

// The cookie lives in the browser, so the user can edit it to anything.
// Treat it like any other user input: keep only positive whole-number ids
// and quantities, otherwise {"1": -5} becomes an order with a negative total.
export const readCart = (c: Context): Cart => parseCart(getCookie(c, COOKIE))

// Pure: string in, Cart out. No request, no cookie API, so it's unit-testable.
export const parseCart = (raw: string | undefined): Cart => {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const cart: Cart = {}
  for (const [id, qty] of Object.entries(parsed)) {
    if (/^[1-9]\d*$/.test(id) && Number.isInteger(qty) && qty > 0) cart[id] = Math.min(qty, MAX_QTY)
  }
  return cart
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
