import { expect, test } from 'bun:test'
import { newOrderSchema, shippingSchema } from '../../src/lib/schemas'
import { formatCents } from '../../src/lib/money'

const shipping = { name: 'Ana', email: 'ana@example.com', phone: '0917', city: 'Manila', address: '1 Rizal St' }

test('shipping fields are trimmed and unknown fields are dropped', () => {
  const result = shippingSchema.parse({ ...shipping, name: '  Ana  ', payment: 'cod' })
  expect(result).toEqual(shipping)
})

test('friendly messages for the HTML form', () => {
  const result = shippingSchema.safeParse({ ...shipping, city: '   ' })
  expect(result.success).toBe(false)
  expect(result.error?.issues[0]?.message).toBe('City is required.')
})

test.each([
  ['no items', []],
  ['zero quantity', [{ productId: 1, quantity: 0 }]],
  ['fractional quantity', [{ productId: 1, quantity: 1.5 }]],
  ['quantity as string', [{ productId: 1, quantity: '2' }]],
  ['duplicate product', [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }]],
])('order rejects %s', (_, items) => {
  expect(newOrderSchema.safeParse({ ...shipping, items }).success).toBe(false)
})

test('formatCents shows pesos', () => {
  expect(formatCents(149950)).toBe('₱1,499.50')
})
