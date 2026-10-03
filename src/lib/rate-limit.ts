import { sql } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { getConnInfo } from 'hono/bun'
import type { Context, Env } from 'hono'
import { db } from '../db'
import { rateLimits } from '../db/schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// A template literal type: '15m' and '1s' compile, '15 minutes' and '15' don't.
export type Duration = `${number}${'ms' | 's' | 'm' | 'h'}`

const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const

export const ms = (d: Duration) => {
  const [, value, unit] = d.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/) ?? []
  if (!value || !unit) throw new Error(`invalid duration "${d}"`)
  return Number(value) * UNIT_MS[unit as keyof typeof UNIT_MS]
}

// Discriminated union: `remaining` only exists when allowed, `retryAfterMs`
// only when denied. You can't read the wrong one by accident.
export type Decision =
  | { allowed: true; remaining: number; resetMs: number }
  | { allowed: false; retryAfterMs: number; resetMs: number }

// Every algorithm below implements this, so the middleware works with any of
// them, in memory or in Postgres. `now` is a parameter so tests can control time.
export type RateLimiter = {
  limit: number
  take: (key: string, now?: number) => Decision | Promise<Decision>
  reset?: () => void
}

const allow = (remaining: number, resetMs: number): Decision => ({ allowed: true, remaining, resetMs })
const deny = (retryAfterMs: number, resetMs: number): Decision => ({ allowed: false, retryAfterMs: Math.ceil(retryAfterMs), resetMs })

// In-memory state per key. Capped so a flood of distinct keys (spoofed or
// rotating IPs) can't grow memory without limit: when full, the least
// recently used key is evicted (a Map iterates in insertion order).
const MAX_KEYS = 100_000
const store = <T>() => {
  const map = new Map<string, T>()
  return {
    get: (key: string) => map.get(key),
    set: (key: string, value: T) => {
      map.delete(key) // re-insert = mark as most recently used
      if (map.size >= MAX_KEYS) map.delete(map.keys().next().value!)
      map.set(key, value)
    },
    clear: () => map.clear(),
  }
}

// ---------------------------------------------------------------------------
// 1. Fixed window: count requests per calendar window (e.g. per minute).
//    Simplest and cheapest. Weakness: a client can send `limit` requests at
//    the end of one window and `limit` more at the start of the next, so up
//    to 2x the limit in a short burst across the boundary.
// ---------------------------------------------------------------------------
export const fixedWindow = ({ limit, window }: { limit: number; window: Duration }): RateLimiter => {
  const windowMs = ms(window)
  const state = store<{ start: number; count: number }>()
  return {
    limit,
    take(key, now = Date.now()) {
      const start = Math.floor(now / windowMs) * windowMs
      const prev = state.get(key)
      const count = prev && prev.start === start ? prev.count : 0
      const resetMs = start + windowMs - now
      if (count >= limit) return deny(resetMs, resetMs)
      state.set(key, { start, count: count + 1 })
      return allow(limit - count - 1, resetMs)
    },
    reset: state.clear,
  }
}

// ---------------------------------------------------------------------------
// 2. Sliding window log: remember the timestamp of every request and count
//    those in the last `window`. Exact, no boundary burst. Costs memory:
//    up to `limit` timestamps per key, so use it for small limits (logins).
// ---------------------------------------------------------------------------
export const slidingWindowLog = ({ limit, window }: { limit: number; window: Duration }): RateLimiter => {
  const windowMs = ms(window)
  const state = store<number[]>()
  return {
    limit,
    take(key, now = Date.now()) {
      const log = (state.get(key) ?? []).filter((t) => t > now - windowMs)
      const oldest = log[0]
      if (oldest !== undefined && log.length >= limit) {
        state.set(key, log)
        const retry = oldest + windowMs - now
        return deny(retry, retry)
      }
      log.push(now)
      state.set(key, log)
      return allow(limit - log.length, log[0]! + windowMs - now)
    },
    reset: state.clear,
  }
}

// ---------------------------------------------------------------------------
// 3. Sliding window counter: fixed-window memory cost, near-sliding accuracy.
//    Weights the previous window's count by how much of it still overlaps
//    the sliding window: estimate = prev * (1 - elapsed) + current.
//    This is the approach Cloudflare describes for its rate limiter.
// ---------------------------------------------------------------------------
export const slidingWindowCounter = ({ limit, window }: { limit: number; window: Duration }): RateLimiter => {
  const windowMs = ms(window)
  const state = store<{ start: number; count: number; prev: number }>()
  return {
    limit,
    take(key, now = Date.now()) {
      const start = Math.floor(now / windowMs) * windowMs
      const s = state.get(key)
      const current = s?.start === start ? s.count : 0
      const prev = s?.start === start ? s.prev : s?.start === start - windowMs ? s.count : 0
      const elapsed = (now - start) / windowMs
      const estimate = prev * (1 - elapsed) + current
      const resetMs = start + windowMs - now

      if (estimate + 1 > limit) {
        // Wait until enough of the previous window has slid out of view:
        // prev * (1 - e) + current + 1 <= limit. If the current window alone
        // is full, it becomes "prev" next window and the same rule applies.
        const room = limit - 1 - current
        const retry =
          room >= 0
            ? (1 - room / prev) * windowMs - (now - start)
            : resetMs + (1 - (limit - 1) / current) * windowMs
        state.set(key, { start, count: current, prev })
        return deny(Math.max(1, retry), resetMs)
      }
      state.set(key, { start, count: current + 1, prev })
      return allow(Math.max(0, Math.floor(limit - estimate - 1)), resetMs)
    },
    reset: state.clear,
  }
}

// ---------------------------------------------------------------------------
// 4. Token bucket: a bucket holds up to `capacity` tokens and refills at a
//    steady rate. Each request takes one token. Allows short bursts (up to
//    `capacity`) while enforcing an average rate. Used by AWS, Stripe and
//    most public APIs.
// ---------------------------------------------------------------------------
export const tokenBucket = ({
  capacity,
  refill,
}: {
  capacity: number
  refill: { tokens: number; every: Duration }
}): RateLimiter => {
  const perMs = refill.tokens / ms(refill.every)
  const state = store<{ tokens: number; at: number }>()
  return {
    limit: capacity,
    take(key, now = Date.now()) {
      const s = state.get(key) ?? { tokens: capacity, at: now }
      // Refill lazily: no timers, just compute what has dripped in since last time.
      const tokens = Math.min(capacity, s.tokens + (now - s.at) * perMs)
      if (tokens < 1) {
        state.set(key, { tokens, at: now })
        return deny((1 - tokens) / perMs, (capacity - tokens) / perMs)
      }
      state.set(key, { tokens: tokens - 1, at: now })
      return allow(Math.floor(tokens - 1), (capacity - tokens + 1) / perMs)
    },
    reset: state.clear,
  }
}

// ---------------------------------------------------------------------------
// 5. Leaky bucket (as a meter): each request pours one unit into a bucket
//    that leaks at a steady rate; if it would overflow, reject. It is the
//    mirror image of the token bucket (tracking "used" instead of "left"),
//    so the two behave the same. The other form, leaky bucket as a *queue*,
//    delays requests instead of rejecting them, smoothing bursts into a
//    steady outflow (nginx's limit_req works this way).
// ---------------------------------------------------------------------------
export const leakyBucket = ({
  capacity,
  leak,
}: {
  capacity: number
  leak: { requests: number; every: Duration }
}): RateLimiter => {
  const perMs = leak.requests / ms(leak.every)
  const state = store<{ level: number; at: number }>()
  return {
    limit: capacity,
    take(key, now = Date.now()) {
      const s = state.get(key) ?? { level: 0, at: now }
      const level = Math.max(0, s.level - (now - s.at) * perMs)
      if (level + 1 > capacity) {
        state.set(key, { level, at: now })
        return deny((level + 1 - capacity) / perMs, level / perMs)
      }
      state.set(key, { level: level + 1, at: now })
      return allow(Math.floor(capacity - level - 1), (level + 1) / perMs)
    },
    reset: state.clear,
  }
}

// ---------------------------------------------------------------------------
// 6. Fixed window in Postgres: the in-memory limiters above are per process.
//    Run two servers behind a load balancer and each one has its own counts,
//    so the real limit doubles. A shared store fixes that. Redis is the usual
//    choice; we already have Postgres, and one atomic upsert does the job:
//    insert the counter, or bump it if the row exists, in ONE statement.
// ---------------------------------------------------------------------------
export const pgFixedWindow = ({ name, limit, window }: { name: string; limit: number; window: Duration }): RateLimiter => {
  const windowMs = ms(window)
  return {
    limit,
    async take(key, now = Date.now()) {
      const start = Math.floor(now / windowMs) * windowMs
      const windowStart = new Date(start)
      const [row] = await db
        .insert(rateLimits)
        .values({ key: `${name}:${key}`, windowStart, count: 1 })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: {
            // `excluded` is the row we tried to insert. Same window: +1.
            // New window: start again at 1.
            count: sql`CASE WHEN ${rateLimits.windowStart} = excluded.window_start THEN ${rateLimits.count} + 1 ELSE 1 END`,
            windowStart: sql`excluded.window_start`,
          },
        })
        .returning({ count: rateLimits.count })
      const count = row?.count ?? 1
      const resetMs = start + windowMs - now
      // Denied attempts still count, so hammering keeps you blocked until the window ends.
      return count > limit ? deny(resetMs, resetMs) : allow(limit - count, resetMs)
    },
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// The client's IP as Bun sees it. Behind a reverse proxy (nginx, Caddy, a
// load balancer) this is the proxy's IP for everyone. Then read
// X-Forwarded-For, but ONLY the entry added by your own proxy: clients can
// send that header themselves to pretend to be anyone.
export const clientIp = (c: Context) => {
  try {
    return ipKey(getConnInfo(c).remote.address ?? 'unknown')
  } catch {
    return 'unknown' // app.request() in tests has no socket
  }
}

// One client, one key:
// - "::ffff:1.2.3.4" is IPv4 1.2.3.4 seen through an IPv6 socket.
// - An IPv6 user typically controls a whole /64 (18 quintillion addresses),
//   so a per-address limit is trivially dodged. Limit the /64 prefix instead.
export const ipKey = (ip: string) => {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return mapped[1]!
  if (!ip.includes(':')) return ip
  const [head = '', tail] = ip.toLowerCase().split('%')[0]!.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = tail === undefined ? h : [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t]
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`
}

export const setRateLimitHeaders = (c: Context, limit: number, d: Decision) => {
  // Widely used RateLimit-* fields (IETF draft) + the standard Retry-After.
  c.header('RateLimit-Limit', String(limit))
  c.header('RateLimit-Remaining', String(d.allowed ? d.remaining : 0))
  c.header('RateLimit-Reset', String(Math.ceil(d.resetMs / 1000)))
  if (!d.allowed) c.header('Retry-After', String(Math.ceil(d.retryAfterMs / 1000)))
}

export const rateLimit = <E extends Env = Env>(
  limiter: RateLimiter,
  // The key decides who shares a bucket. It must be something the client
  // can't freely change: keying on a bearer token the client sends would let
  // an attacker get a fresh bucket per request by inventing tokens.
  key: (c: Context<E>) => string,
  onLimited: (c: Context<E>, d: Extract<Decision, { allowed: false }>) => Response | Promise<Response>,
) =>
  createMiddleware<E>(async (c, next) => {
    const decision = await limiter.take(key(c))
    setRateLimitHeaders(c, limiter.limit, decision)
    if (!decision.allowed) return onLimited(c, decision)
    await next()
  })

export const retryText = (retryAfterMs: number) => {
  const minutes = Math.ceil(retryAfterMs / 60_000)
  return minutes <= 1 ? 'in a minute' : `in ${minutes} minutes`
}
