// Integration tests need Postgres: this import creates + migrates the test DB once.
import './setup'
import { beforeEach, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { orders, products } from '../../src/db/schema'
import { OrderModel, OutOfStockError } from '../../src/models/order'
import { createUser, request, resetDb } from './helpers'

type Product = typeof products.$inferSelect
let userId: number
let watch: Product
let lamp: Product

beforeEach(async () => {
  await resetDb()
  userId = (await createUser()).id
  const rows = await db
    .insert(products)
    .values([
      { slug: 'watch', name: 'Watch', priceCents: 1000, imageUrl: '/x.jpg', stock: 1 },
      { slug: 'lamp', name: 'Lamp', priceCents: 500, imageUrl: '/x.jpg', stock: 10 },
    ])
    .returning()
  watch = rows[0]!
  lamp = rows[1]!
})

const orderFor = (items: { product: Product; quantity: number }[]) =>
  OrderModel.create({
    userId,
    name: 'T', email: 't@example.com', address: 'a', city: 'c', phone: '1',
    items: items.map(({ product, quantity }) => ({ productId: product.id, name: product.name, priceCents: product.priceCents, quantity })),
  })

const stockOf = async (id: number) => (await db.select().from(products).where(eq(products.id, id)))[0]!.stock

test('placing an order takes stock', async () => {
  await orderFor([{ product: lamp, quantity: 3 }])
  expect(await stockOf(lamp.id)).toBe(7)
})

test('out of stock rolls back the whole order', async () => {
  const attempt = orderFor([{ product: lamp, quantity: 2 }, { product: watch, quantity: 2 }])
  expect(attempt).rejects.toBeInstanceOf(OutOfStockError)
  await attempt.catch(() => {})
  expect(await stockOf(lamp.id)).toBe(10) // lamp stock given back
  expect(await db.$count(orders)).toBe(0)
})

test('two buyers racing for the last item: exactly one wins', async () => {
  const results = await Promise.allSettled([orderFor([{ product: watch, quantity: 1 }]), orderFor([{ product: watch, quantity: 1 }])])
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(await stockOf(watch.id)).toBe(0)
})

test('database refuses negative stock even if app code is wrong', async () => {
  expect(db.update(products).set({ stock: -1 }).where(eq(products.id, watch.id)).execute()).rejects.toThrow()
})

test('tampered cart cookie is ignored', async () => {
  const cart = encodeURIComponent(JSON.stringify({ [watch.id]: -5, x: 3, [lamp.id]: 1.5 }))
  const res = await request('/shop/cart', { cookie: `cart=${cart}` })
  expect(await res.text()).toContain('Your cart is empty')
})
