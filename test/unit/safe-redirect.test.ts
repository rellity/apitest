import { expect, test } from 'bun:test'
import { safeRedirect } from '../../src/lib/auth'

test.each([
  ['/shop/checkout', '/shop/checkout'],
  ['/admin/products', '/admin/products'],
  [undefined, '/shop'],
  ['', '/shop'],
  ['https://evil.example', '/shop'],
  ['//evil.example', '/shop'], // protocol-relative: browsers treat it as another site
  ['/\\evil.example', '/shop'], // browsers normalise \ to /
  ['javascript:alert(1)', '/shop'],
])('safeRedirect(%p) -> %p', (input, expected) => {
  expect(safeRedirect(input)).toBe(expected)
})
