import { eq } from 'drizzle-orm'
import { db } from '../db'
import { products } from '../db/schema'

export const Product = {
  all: () => db.select().from(products).orderBy(products.id),
  featured: () => db.select().from(products).where(eq(products.featured, true)).orderBy(products.id),
  bySlug: async (slug: string) => (await db.select().from(products).where(eq(products.slug, slug)))[0],
  byId: async (id: number) => (await db.select().from(products).where(eq(products.id, id)))[0],
}
