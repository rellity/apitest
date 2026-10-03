import { pgFixedWindow, slidingWindowCounter, slidingWindowLog, tokenBucket, type RateLimiter } from './rate-limit'

// Every rate limit in the app, in one place, so the policy is easy to review.
// `satisfies` checks each entry is a RateLimiter without widening the type.
export const limits = {
  // The whole JSON API, per IP: bursts of up to 60, then 1 request/second on average.
  api: tokenBucket({ capacity: 60, refill: { tokens: 1, every: '1s' } }),

  // Login attempts per IP. Shared by the HTML login form and POST /api/v1/tokens,
  // so switching between them doesn't double the budget. Exact (log) because the
  // limit is small and precision matters for security.
  loginPerIp: slidingWindowLog({ limit: 20, window: '15m' }),

  // Login attempts per email, stored in Postgres so every server sees the same
  // count. Stops slow guessing of one account from many IPs. Trade-off: anyone
  // can lock an account out for 15 minutes by failing 10 times. That's why the
  // window is short and nothing is permanently locked.
  loginPerEmail: pgFixedWindow({ name: 'login-email', limit: 10, window: '15m' }),

  // New accounts per IP. Counts attempts, so it's generous enough for typos.
  registerPerIp: slidingWindowCounter({ limit: 10, window: '1h' }),
} satisfies Record<string, RateLimiter>

// Tests start every case from a clean slate (Postgres counters are truncated with the tables).
export const resetMemoryLimits = () => Object.values(limits).forEach((l) => l.reset?.())
