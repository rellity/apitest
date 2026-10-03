# shopilyo: a backend tutorial

A small online shop used to teach backend fundamentals: validation, transactions,
migrations, authorization, JSON APIs and testing, with **type safety** in every lesson.

Stack: [Bun](https://bun.sh) · [Hono](https://hono.dev) (server + JSX views) ·
[Drizzle ORM](https://orm.drizzle.team) + PostgreSQL · [htmx](https://htmx.org) + [Alpine.js](https://alpinejs.dev) ·
Tailwind CSS · zod · Playwright.

## Setup

```sh
bun install
docker compose up -d          # Postgres on localhost:5433
bun run db:migrate            # create tables from drizzle/ migrations
bun run db:seed               # sample products
bun run dev                   # http://localhost:3000
```

Make yourself an admin (register in the shop first):

```sh
bun run admin:grant you@example.com   # then open /admin
```

> Created your database with `db:push` before migrations existed? Run
> `docker compose down -v` once (this deletes the local data), then `db:migrate`.

## Scripts

| Script | What it does |
| --- | --- |
| `dev` | Builds client JS + CSS in watch mode and runs the server with hot reload |
| `build` / `start` | Production build into `public/` and `dist/`, then run it |
| `typecheck` | `tsc --noEmit` over everything, tests included |
| `test` | All `bun test` tests (unit + integration) |
| `test:unit` | Pure functions only. No database, runs in milliseconds |
| `test:integration` | Real Postgres (`app_test` database, created automatically) |
| `test:e2e` | Playwright in a real browser against `app_e2e` (run `bunx playwright install chromium` once) |
| `db:generate` | Write a new migration from changes in `src/db/schema.ts` |
| `db:migrate` | Apply pending migrations |
| `db:push` | Sync schema directly, no migration file (prototyping only) |
| `db:seed` | Insert/update sample products |
| `db:studio` | Browse the database in Drizzle Studio |
| `admin:grant` | Give a user the admin role |

## Lessons

Each lesson is one commit. Read the diff with `git show <commit>`, or check it out
with `git checkout <commit>` to run the app as it was at that point.

| # | Lesson | Commit | Topics |
| --- | --- | --- | --- |
| 0 | The starting shop | `f49138b` | Hono routing, JSX views, htmx swaps, cookie cart, sessions, CSRF |
| 1 | Correct checkout | `a0ec379` | Trust boundaries, transactions, atomic check-and-update, N+1 queries |
| 2 | Migrations & integration tests | `f6e1123` | drizzle-kit migrations, CHECK constraints, test database, race-condition tests |
| 3 | Stricter TypeScript | `23c4ae2` | `noUncheckedIndexedAccess`, honest `T \| undefined` |
| 4 | Admin panel | `e81e0cc` | Authentication vs authorization, typed middleware, REST verbs, FK errors, state machines |
| 5 | JSON API | `b7d356d` | zod schemas, hashed bearer tokens, DTOs, consistent errors, typed RPC client |
| 6 | Unit & E2E tests | `94162a0`, `57f2f4c` | Test pyramid, pure functions, table-driven tests, Playwright journeys |

## Layout

```
src/
  index.ts            app: middleware, routes, error handling
  controllers/        shop (HTML), admin (HTML), api (JSON)
  models/             database access, one object per table
  lib/                auth, cart, validation schemas, helpers
  views/              Hono JSX components
  db/                 Drizzle schema + connection
  scripts/            seed, make-admin
drizzle/              generated SQL migrations (commit these)
test/unit/            no database
test/integration/     real database via app.request / testClient
e2e/                  Playwright journeys
```
