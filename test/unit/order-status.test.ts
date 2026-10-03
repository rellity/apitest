import { expect, test } from 'bun:test'
import { nextStatuses } from '../../src/models/order'
import { ORDER_STATUSES } from '../../src/db/schema'

test('order lifecycle: placed -> shipped -> delivered, cancel only before shipping', () => {
  expect(nextStatuses('placed')).toEqual(['shipped', 'cancelled'])
  expect(nextStatuses('shipped')).toEqual(['delivered'])
  expect(nextStatuses('delivered')).toEqual([])
  expect(nextStatuses('cancelled')).toEqual([])
})

test('every status is known to the state machine', () => {
  for (const status of ORDER_STATUSES) expect(Array.isArray(nextStatuses(status))).toBe(true)
})
