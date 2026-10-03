import { Hono } from 'hono'
import { Layout } from '../views/layout'
import { AdminLayout } from '../views/admin/layout'
import { ProductsPage, ProductForm, ProductRow, emptyProductForm, productToFormValues } from '../views/admin/products'
import { OrdersPage, OrderRow } from '../views/admin/orders'
import { Toast } from '../views/shop/toast'
import { Product } from '../models/product'
import { OrderModel } from '../models/order'
import { ORDER_STATUSES, type OrderStatus } from '../db/schema'
import { PgCode, pgErrorCode } from '../db'
import { requireAdmin, type AdminEnv } from '../lib/auth'
import { parseProductForm } from '../lib/product-form'

// A type guard: after `if (isOrderStatus(x))`, TypeScript knows x is OrderStatus.
const isOrderStatus = (value: unknown): value is OrderStatus => ORDER_STATUSES.includes(value as OrderStatus)

// new Hono<AdminEnv>() + requireAdmin: every handler below gets a typed c.var.user.
export const adminController = new Hono<AdminEnv>()
  .use('*', requireAdmin)
  .get('/', (c) => c.redirect('/admin/products'))
  .get('/products', async (c) =>
    c.html(
      <Layout>
        <AdminLayout user={c.var.user} active="/admin/products">
          <ProductsPage products={await Product.all()} />
        </AdminLayout>
      </Layout>,
    ),
  )
  .get('/products/new', (c) =>
    c.html(
      <Layout>
        <AdminLayout user={c.var.user} active="/admin/products">
          <ProductForm values={emptyProductForm} />
        </AdminLayout>
      </Layout>,
    ),
  )
  .post('/products', async (c) => {
    const parsed = parseProductForm(await c.req.parseBody())
    const formError = (error: string) =>
      c.html(
        <Layout>
          <AdminLayout user={c.var.user} active="/admin/products">
            <ProductForm values={parsed.values} error={error} />
          </AdminLayout>
        </Layout>,
        400,
      )
    // After this line TypeScript narrows `parsed` to the ok variant,
    // so parsed.data is a fully typed ProductInput.
    if (!parsed.ok) return formError(parsed.error)

    try {
      await Product.create(parsed.data)
    } catch (err) {
      if (pgErrorCode(err) === PgCode.uniqueViolation) return formError('That slug is already used.')
      throw err
    }
    c.header('HX-Redirect', '/admin/products')
    return c.body(null)
  })
  .get('/products/:id/edit', async (c) => {
    const id = Number(c.req.param('id'))
    const product = await Product.byId(id)
    if (!product) return c.notFound()
    return c.html(
      <Layout>
        <AdminLayout user={c.var.user} active="/admin/products">
          <ProductForm id={id} values={productToFormValues(product)} />
        </AdminLayout>
      </Layout>,
    )
  })
  .put('/products/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!(await Product.byId(id))) return c.notFound()

    const parsed = parseProductForm(await c.req.parseBody())
    const formError = (error: string) =>
      c.html(
        <Layout>
          <AdminLayout user={c.var.user} active="/admin/products">
            <ProductForm id={id} values={parsed.values} error={error} />
          </AdminLayout>
        </Layout>,
        400,
      )
    if (!parsed.ok) return formError(parsed.error)

    try {
      await Product.update(id, parsed.data)
    } catch (err) {
      if (pgErrorCode(err) === PgCode.uniqueViolation) return formError('That slug is already used.')
      throw err
    }
    c.header('HX-Redirect', '/admin/products')
    return c.body(null)
  })
  .delete('/products/:id', async (c) => {
    const product = await Product.byId(Number(c.req.param('id')))
    if (!product) return c.notFound()
    try {
      await Product.remove(product.id)
    } catch (err) {
      // order_items.product_id references products.id. Postgres refuses to
      // delete a product that's in an order, so old orders never point at nothing.
      if (pgErrorCode(err) === PgCode.foreignKeyViolation) {
        return c.html(
          <>
            <ProductRow product={product} />
            <Toast tone="error" message={`${product.name} is in past orders. Set its stock to 0 instead.`} />
          </>,
          409,
        )
      }
      throw err
    }
    return c.html(<Toast message={`Deleted ${product.name}`} />)
  })
  .get('/orders', async (c) =>
    c.html(
      <Layout>
        <AdminLayout user={c.var.user} active="/admin/orders">
          <OrdersPage orders={await OrderModel.all()} />
        </AdminLayout>
      </Layout>,
    ),
  )
  .patch('/orders/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const { status } = await c.req.parseBody()
    if (!Number.isInteger(id) || !isOrderStatus(status)) return c.text('Bad request', 400)

    const updated = await OrderModel.setStatus(id, status)
    if (updated) return c.html(<OrderRow order={updated} />)

    // Not allowed from its current status (or someone else changed it first):
    // show the row as it really is now.
    const current = await OrderModel.byId(id)
    if (!current) return c.notFound()
    return c.html(
      <>
        <OrderRow order={current} />
        <Toast tone="error" message={`Order #${id} is ${current.status}, can't mark it ${status}.`} />
      </>,
      409,
    )
  })
