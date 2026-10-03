// Integration tests need Postgres: this import creates + migrates the test DB once.
import './setup'
import { beforeEach, expect, test } from 'bun:test'
import { pgFixedWindow } from '../../src/lib/rate-limit'
import { UserModel } from '../../src/models/user'
import { request, resetDb } from './helpers'

beforeEach(async () => {
  await resetDb()
  await UserModel.create({ name: 'Ana', email: 'ana@example.com', password: 'password123' })
})

const login = (email: string, password = 'wrong-password') =>
  request('/shop/login', { form: { email, password, redirect: '/shop' } })
const apiToken = (email: string, password = 'wrong-password') =>
  request('/api/v1/tokens', { method: 'POST', json: { email, password } })

test('10 failed logins for one email, then 429 with Retry-After', async () => {
  for (let i = 0; i < 10; i++) expect((await login('ana@example.com')).status).toBe(400)

  const blocked = await login('ana@example.com')
  expect(blocked.status).toBe(429)
  expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
  expect(await blocked.text()).toContain('Too many attempts for this email')

  // Even the right password is refused while blocked: that's what stops guessing.
  expect((await login('ana@example.com', 'password123')).status).toBe(429)
  // Other accounts are unaffected.
  expect((await login('ben@example.com')).status).toBe(400)
})

test('20 attempts per IP across many emails, then 429', async () => {
  for (let i = 0; i < 20; i++) expect((await login(`user${i}@example.com`)).status).toBe(400)
  const blocked = await login('someone-else@example.com')
  expect(blocked.status).toBe(429)
  expect(await blocked.text()).toContain('Too many login attempts')
})

test('the HTML form and the API share one per-email budget', async () => {
  for (let i = 0; i < 5; i++) await login('ana@example.com')
  for (let i = 0; i < 5; i++) expect((await apiToken('ana@example.com')).status).toBe(401)

  const blocked = await apiToken('ana@example.com', 'password123')
  expect(blocked.status).toBe(429)
  expect(await blocked.json()).toMatchObject({ error: { code: 'rate_limited' } })
})

test('email matching is case-insensitive, so ANA@ can’t dodge the limit', async () => {
  for (let i = 0; i < 10; i++) await login('ana@example.com')
  expect((await login('ANA@Example.com')).status).toBe(429)
})

test('API responses carry RateLimit headers; the bucket empties after 60 quick calls', async () => {
  const first = await request('/api/v1/products')
  expect(first.headers.get('ratelimit-limit')).toBe('60')
  expect(first.headers.get('ratelimit-remaining')).toBe('59')

  for (let i = 0; i < 59; i++) await request('/api/v1/products')
  const blocked = await request('/api/v1/products')
  expect(blocked.status).toBe(429)
  expect(blocked.headers.get('retry-after')).toBe('1') // one token refills per second
})

test('Postgres limiter is atomic: 25 concurrent requests, exactly 10 allowed', async () => {
  const limiter = pgFixedWindow({ name: 'race', limit: 10, window: '1m' })
  const results = await Promise.all(Array.from({ length: 25 }, () => limiter.take('same-key', 0)))
  expect(results.filter((d) => d.allowed)).toHaveLength(10)
})

test('Postgres limiter starts over in a new window', async () => {
  const limiter = pgFixedWindow({ name: 'windows', limit: 1, window: '1m' })
  expect((await limiter.take('k', 0)).allowed).toBe(true)
  expect((await limiter.take('k', 30_000)).allowed).toBe(false)
  expect((await limiter.take('k', 60_000)).allowed).toBe(true)
})
