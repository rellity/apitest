// Integration tests need Postgres: this import creates + migrates the test DB once.
import './setup'
import { beforeEach, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { products } from '../../src/db/schema'
import { OrderModel } from '../../src/models/order'
import { createUser, request, resetDb, sessionCookie } from './helpers'

let admin: string
let product: typeof products.$inferSelect

const validForm = { name: 'Mug', slug: 'mug', category: 'Home', description: '', price: '199.50', stock: '5', imageUrl: '/mug.jpg' }

beforeEach(async () => {
  await resetDb()
  admin = await sessionCookie((await createUser('admin')).id)
  const [row] = await db
    .insert(products)
    .values({ slug: 'lamp', name: 'Lamp', priceCents: 500, imageUrl: '/x.jpg', stock: 10 })
    .returning()
  product = row!
})

const placeOrder = async (quantity: number) => {
  const buyer = await createUser()
  return OrderModel.create({
    userId: buyer.id, name: 'B', email: 'b@example.com', address: 'a', city: 'c', phone: '1',
    items: [{ productId: product.id, name: product.name, priceCents: product.priceCents, quantity }],
  })
}
const stock = async () => (await db.select().from(products).where(eq(products.id, product.id)))[0]!.stock

test('guests are sent to log in, then back', async () => {
  const res = await request('/admin/products')
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe('/shop/login?redirect=%2Fadmin%2Fproducts')
})

test('buyers get 403', async () => {
  const buyer = await sessionCookie((await createUser()).id)
  expect((await request('/admin/products', { cookie: buyer })).status).toBe(403)
})

test('admin creates a product, price stored as integer cents', async () => {
  const res = await request('/admin/products', { cookie: admin, form: validForm })
  expect(res.headers.get('hx-redirect')).toBe('/admin/products')
  const [mug] = await db.select().from(products).where(eq(products.slug, 'mug'))
  expect(mug?.priceCents).toBe(19950)
})

test('invalid form and duplicate slug re-render the form with a message', async () => {
  const bad = await request('/admin/products', { cookie: admin, form: { ...validForm, price: '1,000' } })
  expect(bad.status).toBe(400)
  expect(await bad.text()).toContain('Price must be a number')

  const dup = await request('/admin/products', { cookie: admin, form: { ...validForm, slug: 'lamp' } })
  expect(dup.status).toBe(400)
  expect(await dup.text()).toContain('That slug is already used.')
})

test('a product in past orders cannot be deleted', async () => {
  await placeOrder(1)
  const res = await request(`/admin/products/${product.id}`, { method: 'DELETE', cookie: admin })
  expect(res.status).toBe(409)
  expect(await stock()).toBe(9) // still there
})

test('cancelling restocks exactly once', async () => {
  const order = await placeOrder(3)
  expect(await stock()).toBe(7)
  const cancel = () => request(`/admin/orders/${order.id}`, { method: 'PATCH', cookie: admin, form: { status: 'cancelled' } })
  expect((await cancel()).status).toBe(200)
  expect((await cancel()).status).toBe(409)
  expect(await stock()).toBe(10)
})

test('status must follow placed -> shipped -> delivered', async () => {
  const order = await placeOrder(1)
  const set = (status: string) => request(`/admin/orders/${order.id}`, { method: 'PATCH', cookie: admin, form: { status } })
  expect((await set('delivered')).status).toBe(409) // skipped shipped
  expect((await set('shiped')).status).toBe(400) // not a status at all
  expect((await set('shipped')).status).toBe(200)
  expect((await set('delivered')).status).toBe(200)
})
