import { expect, test } from 'bun:test'
import { parseCart } from '../../src/lib/cart'

// Unit tests: pure functions, no database, no server. Milliseconds each.
// test.each runs the same assertion over a table of cases.
test.each([
  ['missing cookie', undefined, {}],
  ['not JSON', 'oops', {}],
  ['JSON array', '[1,2]', {}],
  ['JSON null', 'null', {}],
  ['valid cart', '{"1":2,"7":1}', { 1: 2, 7: 1 }],
  ['negative quantity dropped', '{"1":-5,"2":1}', { 2: 1 }],
  ['fractional quantity dropped', '{"1":1.5}', {}],
  ['string quantity dropped', '{"1":"3"}', {}],
  ['non-numeric id dropped', '{"abc":1,"0":1,"01":1}', {}],
  ['huge quantity capped at 99', '{"1":100000}', { 1: 99 }],
])('parseCart: %s', (_, raw, expected) => {
  expect(parseCart(raw)).toEqual(expected)
})
