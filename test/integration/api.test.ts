// Integration tests need Postgres: this import creates + migrates the test DB once.
import './setup'
import { beforeEach, expect, test } from 'bun:test'
import { testClient } from 'hono/testing'
import { db } from '../../src/db'
import { products } from '../../src/db/schema'
import { apiController } from '../../src/controllers/api'
import { UserModel } from '../../src/models/user'
import type { NewOrderBody } from '../../src/lib/schemas'
import { resetDb } from './helpers'

// testClient is typed from the routes themselves: paths, inputs and JSON
// outputs are all checked by the compiler. Rename a field on the server and
// these tests stop compiling.
const api = testClient(apiController)

let lampId: number
const shipping = { name: 'Ana', email: 'ana@example.com', phone: '0917', city: 'Manila', address: '1 Rizal St' }

beforeEach(async () => {
  await resetDb()
  await UserModel.create({ name: 'Ana', email: 'ana@example.com', password: 'password123' })
  const [lamp] = await db
    .insert(products)
    .values([
      { slug: 'lamp', name: 'Desk Lamp', category: 'Home', priceCents: 500, imageUrl: '/x.jpg', stock: 2 },
      { slug: 'mat', name: 'Yoga Mat', category: 'Fitness', priceCents: 300, imageUrl: '/x.jpg', stock: 5 },
    ])
    .returning()
  lampId = lamp!.id
})

const login = async () => {
  const res = await api.tokens.$post({ json: { email: 'ana@example.com', password: 'password123' } })
  if (res.status !== 201) throw new Error('login failed')
  const { data } = await res.json() // typed: { token: string, user: { id, name, email } }
  return { authorization: `Bearer ${data.token}` }
}

const order = (body: NewOrderBody, headers: Record<string, string>) => api.orders.$post({ json: body }, { headers })

test('lists products, filtered in the database', async () => {
  const res = await api.products.$get({ query: { category: 'Home' } })
  // res.json() is typed as "success body | error body". Checking the status
  // narrows it, so reading .data before checking is a compile error.
  if (res.status !== 200) throw new Error(`unexpected ${res.status}`)
  const { data } = await res.json()
  expect(data.map((p) => p.slug)).toEqual(['lamp'])
})

test('tokens: wrong password is 401, and responses never include the password hash', async () => {
  const bad = await api.tokens.$post({ json: { email: 'ana@example.com', password: 'nope' } })
  expect(bad.status).toBe(401)

  const ok = await api.tokens.$post({ json: { email: 'ana@example.com', password: 'password123' } })
  const text = await ok.text()
  expect(text).toContain('shp_')
  expect(text).not.toContain('passwordHash')
})

test('orders need a token; a revoked token stops working', async () => {
  expect((await api.orders.$get()).status).toBe(401)

  const headers = await login()
  expect((await api.orders.$get({}, { headers })).status).toBe(200)

  expect((await api.tokens.current.$delete({}, { headers })).status).toBe(204)
  expect((await api.orders.$get({}, { headers })).status).toBe(401)
})

test('placing an order uses database prices and returns it', async () => {
  const headers = await login()
  const res = await order({ ...shipping, items: [{ productId: lampId, quantity: 2 }] }, headers)
  expect(res.status).toBe(201)
  if (res.status !== 201) return
  const { data } = await res.json()
  expect(data.subtotalCents).toBe(1000)
  expect(data.items?.[0]?.quantity).toBe(2)
})

test('the compiler rejects a client-supplied price', () => {
  const body: NewOrderBody = {
    ...shipping,
    // @ts-expect-error priceCents is not part of the request schema
    items: [{ productId: lampId, quantity: 1, priceCents: 1 }],
  }
  expect(body).toBeDefined()
})

test('invalid body is 400 with field-level issues', async () => {
  const headers = await login()
  const res = await order({ ...shipping, email: 'not-an-email', items: [] }, headers)
  if (res.status !== 400) throw new Error(`unexpected ${res.status}`)
  const { error } = await res.json() // narrowed to the validator's error shape, issues included
  expect(error.issues.map((i) => i.path).sort()).toEqual(['email', 'items'])
})

test('unknown product is 422, out of stock is 409', async () => {
  const headers = await login()
  expect((await order({ ...shipping, items: [{ productId: 9999, quantity: 1 }] }, headers)).status).toBe(422)
  expect((await order({ ...shipping, items: [{ productId: lampId, quantity: 3 }] }, headers)).status).toBe(409)
})

test("another user's order is 404, not 403", async () => {
  const anaHeaders = await login()
  const placed = await order({ ...shipping, items: [{ productId: lampId, quantity: 1 }] }, anaHeaders)
  if (placed.status !== 201) throw new Error('order failed')
  const { data } = await placed.json()

  await UserModel.create({ name: 'Ben', email: 'ben@example.com', password: 'password123' })
  const benRes = await api.tokens.$post({ json: { email: 'ben@example.com', password: 'password123' } })
  if (benRes.status !== 201) throw new Error('login failed')
  const ben = { authorization: `Bearer ${(await benRes.json()).data.token}` }

  expect((await api.orders[':id'].$get({ param: { id: String(data.id) } }, { headers: ben })).status).toBe(404)
})

test('the API is not behind cookie CSRF checks, but the shop still is', async () => {
  const { default: app } = await import('../../src/index')
  const headers = await login()
  // A bodyless DELETE with no Origin, like curl sends.
  expect((await app.request('/api/v1/tokens/current', { method: 'DELETE', headers })).status).toBe(204)
  // A cross-site form post to the shop is refused with 403, not turned into a 500.
  const forged = await app.request('/shop/logout', {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
  })
  expect(forged.status).toBe(403)
})
