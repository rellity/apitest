import { describe, expect, test } from 'bun:test'
import {
  fixedWindow,
  ipKey,
  leakyBucket,
  ms,
  slidingWindowCounter,
  slidingWindowLog,
  tokenBucket,
  type Decision,
  type RateLimiter,
} from '../../src/lib/rate-limit'

// Time is a parameter (`now`), so these tests never sleep and never flake.
const burst = (limiter: RateLimiter, n: number, at: number, key = 'k') => {
  let allowed = 0
  for (let i = 0; i < n; i++) if ((limiter.take(key, at) as Decision).allowed) allowed++
  return allowed
}
const take = (limiter: RateLimiter, at: number, key = 'k') => limiter.take(key, at) as Decision

test('durations are typed and parsed', () => {
  expect(ms('15m')).toBe(900_000)
  expect(ms('1.5s')).toBe(1500)
  expect(ms('250ms')).toBe(250)
  // @ts-expect-error not a Duration: the template literal type rejects it at compile time
  expect(() => ms('15 minutes')).toThrow()
})

describe('fixed window', () => {
  const limiter = () => fixedWindow({ limit: 10, window: '1m' })

  test('allows the limit, then denies until the window ends', () => {
    const l = limiter()
    expect(burst(l, 15, 1_000)).toBe(10)
    const denied = take(l, 30_000)
    expect(denied).toEqual({ allowed: false, retryAfterMs: 30_000, resetMs: 30_000 })
    expect(take(l, 60_000).allowed).toBe(true) // new window
  })

  test('weakness: 2x the limit in 200ms across a window boundary', () => {
    const l = limiter()
    const total = burst(l, 10, 59_900) + burst(l, 10, 60_100)
    expect(total).toBe(20)
  })

  test('keys are independent', () => {
    const l = limiter()
    expect(burst(l, 10, 0, 'alice')).toBe(10)
    expect(burst(l, 10, 0, 'bob')).toBe(10)
  })
})

describe('sliding window log', () => {
  test('no boundary burst: exactly the limit in any 1-minute span', () => {
    const l = slidingWindowLog({ limit: 10, window: '1m' })
    expect(burst(l, 10, 59_900) + burst(l, 10, 60_100)).toBe(10)
  })

  test('frees capacity exactly when the oldest request leaves the window', () => {
    const l = slidingWindowLog({ limit: 2, window: '1m' })
    take(l, 0)
    take(l, 10_000)
    const denied = take(l, 30_000)
    expect(denied.allowed).toBe(false)
    expect(denied).toMatchObject({ retryAfterMs: 30_000 }) // oldest (t=0) leaves at t=60s
    expect(take(l, 60_001).allowed).toBe(true)
  })
})

describe('sliding window counter', () => {
  test('right after a full window, the previous count still blocks', () => {
    const l = slidingWindowCounter({ limit: 10, window: '1m' })
    expect(burst(l, 10, 59_900) + burst(l, 10, 60_100)).toBe(10)
  })

  test('halfway into the next window, about half the budget is back', () => {
    const l = slidingWindowCounter({ limit: 10, window: '1m' })
    burst(l, 10, 30_000)
    // estimate = 10 * (1 - 0.5) + current, so 5 more fit
    expect(burst(l, 10, 90_000)).toBe(5)
  })

  test('retry hint is when enough of the old window has slid away', () => {
    const l = slidingWindowCounter({ limit: 10, window: '1m' })
    burst(l, 10, 30_000)
    const denied = take(l, 60_000)
    expect(denied.allowed).toBe(false)
    // need 10 * (1 - e) + 0 + 1 <= 10, so e >= 0.1: 6 seconds into the window
    expect(denied).toMatchObject({ retryAfterMs: 6_000 })
    expect(take(l, 66_000).allowed).toBe(true)
  })
})

describe('token bucket', () => {
  const limiter = () => tokenBucket({ capacity: 5, refill: { tokens: 1, every: '1s' } })

  test('allows a burst up to capacity, then one per refill interval', () => {
    const l = limiter()
    expect(burst(l, 10, 0)).toBe(5)
    expect(take(l, 0)).toMatchObject({ allowed: false, retryAfterMs: 1_000 })
    expect(take(l, 1_000).allowed).toBe(true)
    expect(take(l, 1_000).allowed).toBe(false)
  })

  test('refill is capped at capacity, however long you wait', () => {
    const l = limiter()
    burst(l, 5, 0)
    expect(burst(l, 10, 3_600_000)).toBe(5)
  })
})

describe('leaky bucket', () => {
  test('is the mirror image of the token bucket: same decisions for the same traffic', () => {
    const token = tokenBucket({ capacity: 5, refill: { tokens: 1, every: '1s' } })
    const leaky = leakyBucket({ capacity: 5, leak: { requests: 1, every: '1s' } })
    const times = [0, 0, 0, 100, 200, 300, 400, 1_500, 1_600, 2_000, 2_100, 5_000, 5_000, 5_000, 5_000, 9_999]
    const decide = (l: RateLimiter) => times.map((t) => take(l, t).allowed)
    expect(decide(leaky)).toEqual(decide(token))
  })
})

test('the Decision union forces you to check `allowed` first', () => {
  const d = take(fixedWindow({ limit: 1, window: '1s' }), 0)
  // @ts-expect-error retryAfterMs only exists on the denied branch
  d.retryAfterMs
  if (d.allowed) expect(d.remaining).toBe(0)
})

test('memory is bounded: the least recently used key is evicted past 100k keys', () => {
  const l = fixedWindow({ limit: 1, window: '1h' })
  take(l, 0, 'first')
  expect(take(l, 0, 'first').allowed).toBe(false)
  for (let i = 0; i < 100_000; i++) take(l, 0, `k${i}`)
  expect(take(l, 0, 'first').allowed).toBe(true) // forgotten, so it starts fresh
})

test.each([
  ['1.2.3.4', '1.2.3.4'],
  ['::ffff:1.2.3.4', '1.2.3.4'], // IPv4 seen through an IPv6 socket
  ['2001:db8:85a3:0:0:8a2e:370:7334', '2001:db8:85a3:0::/64'],
  ['2001:db8:85a3::8a2e:370:7334', '2001:db8:85a3:0::/64'], // same /64, compressed
  ['2001:DB8:85a3:0000:ffff::1', '2001:db8:85a3:0::/64'], // same /64, other host
  ['2001:db8::1', '2001:db8:0:0::/64'],
  ['::1', '0:0:0:0::/64'],
  ['fe80::1%eth0', 'fe80:0:0:0::/64'], // zone id dropped
])('ipKey(%p) -> %p', (ip, key) => {
  expect(ipKey(ip)).toBe(key)
})
