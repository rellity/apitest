import { SQL } from 'bun'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

// Tests truncate tables. Refuse to run against anything that isn't a *_test database.
const url = new URL(process.env.DATABASE_URL ?? '')
const name = url.pathname.slice(1)
if (!name.endsWith('_test')) throw new Error(`refusing to run tests against "${name}", use a *_test database`)

// Create the test database on first run, then bring it up to date with the same
// migration files production uses.
url.pathname = '/postgres'
const admin = new SQL(url.toString())
const [exists] = await admin`select 1 from pg_database where datname = ${name}`
if (!exists) await admin.unsafe(`create database "${name}"`)
await admin.close()

const { db } = await import('../src/db')
await migrate(db, { migrationsFolder: './drizzle' })
