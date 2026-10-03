import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { orders, orderItems, products, type Order, type OrderItem, type OrderStatus } from '../db/schema'

export type NewOrder = {
  userId: number
  name: string
  email: string
  address: string
  city: string
  phone: string
  items: { productId: number; name: string; priceCents: number; quantity: number }[]
}

export class OutOfStockError extends Error {
  constructor(public productName: string) {
    super(`Not enough stock for ${productName}`)
  }
}

// Which statuses an order may come FROM to reach each status.
// Record<OrderStatus, ...> forces an entry for every status: add a new one to
// ORDER_STATUSES and this line stops compiling until you handle it.
const ALLOWED_FROM: Record<OrderStatus, OrderStatus[]> = {
  placed: [],
  shipped: ['placed'],
  delivered: ['shipped'],
  cancelled: ['placed'],
}

export const nextStatuses = (from: OrderStatus) =>
  (Object.keys(ALLOWED_FROM) as OrderStatus[]).filter((to) => ALLOWED_FROM[to].includes(from))

export const OrderModel = {
  // Everything inside db.transaction either all happens or none of it does.
  // If any line is out of stock we throw, Postgres rolls back the stock
  // already taken for earlier lines, and no half-written order is left behind.
  create: (input: NewOrder) =>
    db.transaction(async (tx) => {
      for (const item of input.items) {
        // Check and decrement in ONE statement. A separate "SELECT stock" then
        // "UPDATE" lets two buyers both see stock=1 and both buy it.
        const [taken] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${item.quantity}` })
          .where(and(eq(products.id, item.productId), gte(products.stock, item.quantity)))
          .returning({ id: products.id })
        if (!taken) throw new OutOfStockError(item.name)
      }

      const subtotalCents = input.items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0)
      const [order] = await tx
        .insert(orders)
        .values({
          userId: input.userId,
          name: input.name,
          email: input.email,
          address: input.address,
          city: input.city,
          phone: input.phone,
          subtotalCents,
        })
        .returning()
      if (!order) throw new Error('failed to create order')
      const items = await tx
        .insert(orderItems)
        .values(
          input.items.map((i) => ({
            orderId: order.id,
            productId: i.productId,
            name: i.name,
            priceCents: i.priceCents,
            quantity: i.quantity,
          })),
        )
        .returning()
      return { ...order, items }
    }),
  byId: async (id: number): Promise<(Order & { items: OrderItem[] }) | undefined> => {
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    if (!order) return
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id))
    return { ...order, items }
  },
  all: () => db.select().from(orders).orderBy(desc(orders.createdAt)),
  // Same trick as stock: the WHERE checks the current status and the UPDATE
  // changes it in one statement, so two admins clicking "cancel" at once can't
  // both succeed (and restock twice). Returns undefined if not allowed.
  setStatus: (id: number, to: OrderStatus) =>
    db.transaction(async (tx) => {
      const [order] = await tx
        .update(orders)
        .set({ status: to })
        .where(and(eq(orders.id, id), inArray(orders.status, ALLOWED_FROM[to])))
        .returning()
      if (!order) return undefined
      if (to === 'cancelled') {
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id))
        for (const item of items) {
          await tx
            .update(products)
            .set({ stock: sql`${products.stock} + ${item.quantity}` })
            .where(eq(products.id, item.productId))
        }
      }
      return order
    }),
  byUser: (userId: number) => db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)),
}
