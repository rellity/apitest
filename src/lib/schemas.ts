import { z } from 'zod'

// One zod schema = runtime validation AND the TypeScript type (z.infer).
// They can't drift apart, unlike a hand-written type plus hand-written checks.

const text = (label: string, max = 200) =>
  z.string(`${label} is required.`).trim().min(1, `${label} is required.`).max(max, `${label} is too long.`)
const email = z.string('Email is required.').trim().pipe(z.email('Enter a valid email.'))

// Used by both the HTML checkout form and POST /api/v1/orders.
export const shippingSchema = z.object({
  name: text('Name', 100),
  email,
  phone: text('Phone', 30),
  city: text('City', 100),
  address: text('Address', 500),
})

export const newOrderSchema = shippingSchema.extend({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, 'Order at least one item.')
    .max(50)
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, 'Each productId may appear once.'),
})
export type NewOrderBody = z.infer<typeof newOrderSchema>

export const tokenRequestSchema = z.object({
  email,
  password: z.string().min(1),
  name: z.string().trim().min(1).max(50).default('api'),
})

export const productQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
})
