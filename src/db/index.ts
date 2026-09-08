import { drizzle } from 'drizzle-orm/bun-sql'

export const db = drizzle(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/app')
