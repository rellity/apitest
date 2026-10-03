import { sql } from 'drizzle-orm'
import { pgTable, integer, text, timestamp, boolean, check } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('buyer'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type User = typeof users.$inferSelect

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at').notNull(),
})

export type Session = typeof sessions.$inferSelect

export const products = pgTable('products', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default('General'),
  priceCents: integer('price_cents').notNull(),
  imageUrl: text('image_url').notNull(),
  stock: integer('stock').notNull().default(0),
  featured: boolean('featured').notNull().default(false),
}, (t) => [
  // Last line of defense: even buggy app code can't oversell.
  check('products_stock_non_negative', sql`${t.stock} >= 0`),
])

export type Product = typeof products.$inferSelect

export const orders = pgTable('orders', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').references(() => users.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  phone: text('phone').notNull(),
  subtotalCents: integer('subtotal_cents').notNull(),
  status: text('status').notNull().default('placed'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type Order = typeof orders.$inferSelect

export const orderItems = pgTable('order_items', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  orderId: integer('order_id').notNull().references(() => orders.id),
  productId: integer('product_id').notNull().references(() => products.id),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  quantity: integer('quantity').notNull(),
})

export type OrderItem = typeof orderItems.$inferSelect
