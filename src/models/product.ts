import { and, eq, ilike, inArray } from 'drizzle-orm'
import { db } from '../db'
import { products } from '../db/schema'

export type ProductInput = Omit<typeof products.$inferInsert, 'id'>

export const Product = {
  all: () => db.select().from(products).orderBy(products.id),
  featured: () => db.select().from(products).where(eq(products.featured, true)).orderBy(products.id),
  bySlug: async (slug: string) => (await db.select().from(products).where(eq(products.slug, slug)))[0],
  // Route params like "abc" become NaN; Postgres would reject that with a 500.
  byId: async (id: number) =>
    Number.isInteger(id) ? (await db.select().from(products).where(eq(products.id, id)))[0] : undefined,
  // One query for the whole cart instead of one per line (the "N+1" problem).
  byIds: (ids: number[]) => (ids.length ? db.select().from(products).where(inArray(products.id, ids)) : Promise.resolve([])),
  // Let Postgres filter instead of loading every row into JS.
  // and() drops undefined conditions, so each filter is optional.
  list: ({ q, category }: { q?: string; category?: string } = {}) =>
    db
      .select()
      .from(products)
      .where(and(q ? ilike(products.name, `%${q}%`) : undefined, category ? eq(products.category, category) : undefined))
      .orderBy(products.id),
  create: async (input: ProductInput) => (await db.insert(products).values(input).returning())[0],
  update: async (id: number, input: ProductInput) =>
    (await db.update(products).set(input).where(eq(products.id, id)).returning())[0],
  remove: (id: number) => db.delete(products).where(eq(products.id, id)),
}
