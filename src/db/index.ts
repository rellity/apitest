import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { DrizzleQueryError } from 'drizzle-orm'

export const db = drizzle(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/app')

// Postgres SQLSTATE codes we turn into friendly messages.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
export const PgCode = { uniqueViolation: '23505', foreignKeyViolation: '23503' } as const

// `catch (err)` gives us `unknown`. Narrow it with instanceof instead of
// reaching for `any`, so a typo like err.cuase is a compile error.
export const pgErrorCode = (err: unknown) =>
  err instanceof DrizzleQueryError && err.cause instanceof SQL.PostgresError ? err.cause.errno : undefined
