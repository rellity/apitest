import { expect, test } from 'bun:test'
import { parseProductForm } from '../../src/lib/product-form'

const valid = { name: ' Mug ', slug: 'big-mug', category: '', description: '', price: '199.5', stock: '3', imageUrl: '/mug.jpg' }

test('valid form becomes a typed ProductInput, money in integer cents', () => {
  const result = parseProductForm(valid)
  // Narrowing: inside this if, TypeScript knows result.data exists.
  if (!result.ok) throw new Error(result.error)
  expect(result.data).toEqual({
    name: 'Mug',
    slug: 'big-mug',
    category: 'General',
    description: '',
    priceCents: 19950,
    stock: 3,
    imageUrl: '/mug.jpg',
    featured: false,
  })
})

test('0.1 + 0.2 style float errors never reach the database', () => {
  const result = parseProductForm({ ...valid, price: '0.29' })
  expect(result.ok && result.data.priceCents).toBe(29) // 0.29 * 100 = 28.999999999999996
})

test.each([
  ['name', { name: '' }, 'Name is required'],
  ['slug with spaces', { slug: 'big mug' }, 'Slug must be'],
  ['slug uppercase', { slug: 'Big-Mug' }, 'Slug must be'],
  ['price with comma', { price: '1,000' }, 'Price must be'],
  ['price 3 decimals', { price: '1.999' }, 'Price must be'],
  ['price too big for integer column', { price: '99999999' }, 'Price must be'],
  ['negative stock', { stock: '-1' }, 'Stock must be'],
  ['javascript: image url', { imageUrl: 'javascript:alert(1)' }, 'Image URL must'],
])('rejects %s', (_, override, message) => {
  const result = parseProductForm({ ...valid, ...override })
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toContain(message)
})
