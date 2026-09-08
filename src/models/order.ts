import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { orders, orderItems, type Order, type OrderItem } from '../db/schema'

export type NewOrder = {
  userId: number
  name: string
  email: string
  address: string
  city: string
  phone: string
  items: { productId: number; name: string; priceCents: number; quantity: number }[]
}

export const OrderModel = {
  create: async (input: NewOrder) => {
    const subtotalCents = input.items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0)
    const [order] = await db
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
    await db.insert(orderItems).values(
      input.items.map((i) => ({
        orderId: order.id,
        productId: i.productId,
        name: i.name,
        priceCents: i.priceCents,
        quantity: i.quantity,
      })),
    )
    return order
  },
  byId: async (id: number): Promise<(Order & { items: OrderItem[] }) | undefined> => {
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    if (!order) return
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id))
    return { ...order, items }
  },
  byUser: (userId: number) => db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)),
}
