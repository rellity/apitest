import { Hono } from 'hono'
import type { ValidationTargets } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { z } from 'zod'
import type { Order, OrderItem, Product as ProductRow, User } from '../db/schema'
import { Product } from '../models/product'
import { OrderModel, OutOfStockError } from '../models/order'
import { UserModel } from '../models/user'
import { ApiTokenModel } from '../models/api-token'
import { bearerToken, requireToken, type ApiEnv } from '../lib/auth'
import { clientIp, rateLimit, setRateLimitHeaders } from '../lib/rate-limit'
import { limits } from '../lib/limits'
import { newOrderSchema, productQuerySchema, tokenRequestSchema } from '../lib/schemas'

// Every error has the same shape, so clients handle errors in one place:
// { error: { code, message, issues? } }
const apiError = (code: string, message: string) => ({ error: { code, message } })
const rateLimited = (retryAfterMs: number) =>
  apiError('rate_limited', `Too many requests. Retry in ${Math.ceil(retryAfterMs / 1000)} seconds.`)

// zValidator + a hook that turns zod issues into our error shape.
// After this middleware, c.req.valid(target) is fully typed from the schema.
const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      return c.json({ error: { code: 'invalid_request', message: 'Request is invalid.', issues } }, 400)
    }
  })

// DTOs ("data transfer objects"): pick exactly which fields leave the server.
// Returning a raw User row would leak passwordHash.
const productDto = (p: ProductRow) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  description: p.description,
  category: p.category,
  priceCents: p.priceCents,
  imageUrl: p.imageUrl,
  stock: p.stock,
})
const userDto = (u: User) => ({ id: u.id, name: u.name, email: u.email })
const orderDto = (o: Order & { items?: OrderItem[] }) => ({
  id: o.id,
  status: o.status,
  subtotalCents: o.subtotalCents,
  createdAt: o.createdAt.toISOString(),
  shipping: { name: o.name, email: o.email, phone: o.phone, city: o.city, address: o.address },
  items: o.items?.map((i) => ({ productId: i.productId, name: i.name, priceCents: i.priceCents, quantity: i.quantity })),
})

const products = new Hono()
  .get('/', validate('query', productQuerySchema), async (c) => {
    const rows = await Product.list(c.req.valid('query'))
    return c.json({ data: rows.map(productDto) })
  })
  .get('/:slug', async (c) => {
    const product = await Product.bySlug(c.req.param('slug'))
    if (!product) return c.json(apiError('not_found', 'No such product.'), 404)
    return c.json({ data: productDto(product) })
  })

const tokens = new Hono()
  // Trade email + password for a token, once. The client stores the token,
  // not the password. It's a login form for scripts, so it's rate-limited like one.
  .post(
    '/',
    rateLimit(limits.loginPerIp, clientIp, (c, d) => c.json(rateLimited(d.retryAfterMs), 429)),
    validate('json', tokenRequestSchema),
    async (c) => {
      const { email, password, name } = c.req.valid('json')
      // Same per-email budget as the HTML login form: using both doesn't double it.
      const perEmail = await limits.loginPerEmail.take(email.toLowerCase())
      setRateLimitHeaders(c, limits.loginPerEmail.limit, perEmail)
      if (!perEmail.allowed) return c.json(rateLimited(perEmail.retryAfterMs), 429)
      const user = await UserModel.byEmail(email)
      if (!user || !(await UserModel.verifyPassword(user, password)))
        return c.json(apiError('invalid_credentials', 'Incorrect email or password.'), 401)
      const token = await ApiTokenModel.create(user.id, name)
      return c.json({ data: { token, user: userDto(user) } }, 201)
    },
  )
  // "Log out" for the API: revoke the token used to make this call.
  .delete('/current', requireToken, async (c) => {
    await ApiTokenModel.revoke(bearerToken(c)!) // requireToken guarantees it's there
    return c.body(null, 204)
  })

const orders = new Hono<ApiEnv>()
  .use(requireToken)
  .get('/', async (c) => {
    const rows = await OrderModel.byUser(c.var.user.id)
    return c.json({ data: rows.map(orderDto) })
  })
  .get('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const order = Number.isInteger(id) ? await OrderModel.byId(id) : undefined
    if (!order || order.userId !== c.var.user.id) return c.json(apiError('not_found', 'No such order.'), 404)
    return c.json({ data: orderDto(order) })
  })
  .post('/', validate('json', newOrderSchema), async (c) => {
    const { items, ...shipping } = c.req.valid('json')

    // Prices come from the database, never from the request body.
    const found = new Map((await Product.byIds(items.map((i) => i.productId))).map((p) => [p.id, p]))
    const lines = []
    for (const item of items) {
      const product = found.get(item.productId)
      if (!product) return c.json(apiError('unknown_product', `No product with id ${item.productId}.`), 422)
      lines.push({ productId: product.id, name: product.name, priceCents: product.priceCents, quantity: item.quantity })
    }

    try {
      const order = await OrderModel.create({ userId: c.var.user.id, ...shipping, items: lines })
      return c.json({ data: orderDto(order) }, 201)
    } catch (err) {
      if (err instanceof OutOfStockError) return c.json(apiError('out_of_stock', err.message), 409)
      throw err
    }
  })

// Chained .route() calls keep every route's types, so `typeof apiController`
// describes the whole API: paths, inputs, and JSON outputs (see hc / testClient).
export const apiController = new Hono()
  // Keyed by IP, never by something the client picks (like the token it sends).
  .use(rateLimit(limits.api, clientIp, (c, d) => c.json(rateLimited(d.retryAfterMs), 429)))
  .route('/products', products)
  .route('/tokens', tokens)
  .route('/orders', orders)

export type ApiType = typeof apiController
