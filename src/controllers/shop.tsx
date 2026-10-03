import { Hono } from 'hono'
import { Layout } from '../views/layout'
import { ShopLayout, CartBadge } from '../views/shop/layout'
import { ProductGrid, CategoryFilter } from '../views/shop/products'
import { ProductDetail } from '../views/shop/product-detail'
import { CartPage, CartLineRow, CartSummary, type CartLine } from '../views/shop/cart'
import { CheckoutPage } from '../views/shop/checkout'
import { OrderConfirmation } from '../views/shop/order-confirmation'
import { LoginPage, RegisterPage } from '../views/shop/auth'
import { OrdersList } from '../views/shop/orders-list'
import { Toast } from '../views/shop/toast'
import { BannerCarousel } from '../views/shop/banners'
import { FeaturedSection } from '../views/shop/featured'
import { Product } from '../models/product'
import { OrderModel, OutOfStockError } from '../models/order'
import { UserModel } from '../models/user'
import { readCart, writeCart, cartCount, type Cart } from '../lib/cart'
import { currentUser, signIn, signOut, safeRedirect } from '../lib/auth'

const cartLines = async (cart: Cart): Promise<CartLine[]> => {
  const found = await Product.byIds(Object.keys(cart).map(Number))
  return found.map((product) => ({ product, quantity: cart[product.id]! }))
}

const subtotal = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0)

export const shopController = new Hono()
  .get('/', async (c) => {
    const category = c.req.query('category')
    const all = await Product.all()
    const categories = [...new Set(all.map((p) => p.category))]
    const filtered = category ? all.filter((p) => p.category === category) : all
    return c.html(
      <Layout>
        <ShopLayout cartCount={cartCount(readCart(c))} user={await currentUser(c)}>
          {!category && (
            <>
              <BannerCarousel />
              <FeaturedSection products={await Product.featured()} />
            </>
          )}
          <CategoryFilter categories={categories} active={category} />
          <ProductGrid products={filtered} />
        </ShopLayout>
      </Layout>,
    )
  })
  .get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim()
    return c.html(<ProductGrid products={await (q ? Product.search(q) : Product.all())} />)
  })
  .get('/products/:slug', async (c) => {
    const product = await Product.bySlug(c.req.param('slug'))
    if (!product) return c.notFound()
    return c.html(
      <Layout>
        <ShopLayout cartCount={cartCount(readCart(c))} user={await currentUser(c)}>
          <ProductDetail product={product} />
        </ShopLayout>
      </Layout>,
    )
  })
  .post('/cart/items', async (c) => {
    const body = await c.req.parseBody()
    const productId = Number(body.productId)
    const requested = Math.max(1, Number(body.quantity) || 1)
    const product = await Product.byId(productId)
    if (!product) return c.body('Product not found', 404)

    const cart = readCart(c)
    const current = cart[productId] ?? 0
    const quantity = Math.min(product.stock, current + requested)
    cart[productId] = quantity
    writeCart(c, cart)

    return c.html(
      <>
        <Toast message={`Added ${product.name} to cart`} />
        <CartBadge count={cartCount(cart)} />
      </>,
    )
  })
  .get('/cart', async (c) => {
    const cart = readCart(c)
    const lines = await cartLines(cart)
    return c.html(
      <Layout>
        <ShopLayout cartCount={cartCount(cart)} user={await currentUser(c)}>
          <CartPage lines={lines} subtotalCents={subtotal(lines)} />
        </ShopLayout>
      </Layout>,
    )
  })
  .patch('/cart/items/:productId', async (c) => {
    const productId = Number(c.req.param('productId'))
    const body = await c.req.parseBody()
    const requested = Number(body.quantity) || 0

    const product = await Product.byId(productId)
    if (!product) return c.notFound()

    const cart = readCart(c)
    const quantity = Math.max(0, Math.min(product.stock, requested))
    if (quantity === 0) delete cart[productId]
    else cart[productId] = quantity
    writeCart(c, cart)

    const lines = await cartLines(cart)
    return c.html(
      <>
        {quantity > 0 ? <CartLineRow line={{ product, quantity }} /> : <div id={`cart-line-${productId}`}></div>}
        <CartSummary subtotalCents={subtotal(lines)} />
        <CartBadge count={cartCount(cart)} />
      </>,
    )
  })
  .delete('/cart/items/:productId', async (c) => {
    const productId = Number(c.req.param('productId'))
    const cart = readCart(c)
    delete cart[productId]
    writeCart(c, cart)
    const lines = await cartLines(cart)
    return c.html(
      <>
        <div id={`cart-line-${productId}`}></div>
        <CartSummary subtotalCents={subtotal(lines)} />
        <CartBadge count={cartCount(cart)} />
      </>,
    )
  })
  .get('/checkout', async (c) => {
    const user = await currentUser(c)
    if (!user) return c.redirect('/shop/login?redirect=/shop/checkout')

    const cart = readCart(c)
    const lines = await cartLines(cart)
    if (lines.length === 0) return c.redirect('/shop/cart')
    return c.html(
      <Layout>
        <ShopLayout cartCount={cartCount(cart)} user={user}>
          <CheckoutPage lines={lines} subtotalCents={subtotal(lines)} user={user} />
        </ShopLayout>
      </Layout>,
    )
  })
  .post('/checkout', async (c) => {
    const user = await currentUser(c)
    if (!user) return c.redirect('/shop/login?redirect=/shop/checkout')

    const cart = readCart(c)
    const lines = await cartLines(cart)
    if (lines.length === 0) return c.redirect('/shop')

    const body = await c.req.parseBody()
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim()
    const phone = String(body.phone ?? '').trim()
    const city = String(body.city ?? '').trim()
    const address = String(body.address ?? '').trim()

    const checkoutError = (error: string) =>
      c.html(
        <Layout>
          <ShopLayout cartCount={cartCount(cart)} user={user}>
            <CheckoutPage lines={lines} subtotalCents={subtotal(lines)} user={user} error={error} />
          </ShopLayout>
        </Layout>,
        400,
      )

    if (!name || !email || !phone || !city || !address) return checkoutError('Please fill in all fields.')

    let order
    try {
      order = await OrderModel.create({
        userId: user.id,
        name,
        email,
        phone,
        city,
        address,
        items: lines.map((l) => ({
          productId: l.product.id,
          name: l.product.name,
          priceCents: l.product.priceCents,
          quantity: l.quantity,
        })),
      })
    } catch (err) {
      if (err instanceof OutOfStockError) return checkoutError(`Sorry, ${err.productName} doesn't have enough stock left.`)
      throw err
    }
    writeCart(c, {})
    c.header('HX-Redirect', `/shop/orders/${order.id}`)
    return c.body(null)
  })
  .get('/orders/:id', async (c) => {
    const user = await currentUser(c)
    if (!user) return c.redirect(`/shop/login?redirect=/shop/orders/${c.req.param('id')}`)

    const id = Number(c.req.param('id'))
    const order = Number.isInteger(id) ? await OrderModel.byId(id) : undefined
    // Same 404 for "doesn't exist" and "not yours" so ids can't be probed.
    if (!order || order.userId !== user.id) return c.notFound()
    return c.html(
      <Layout>
        <ShopLayout cartCount={cartCount(readCart(c))} user={user}>
          <OrderConfirmation order={order} />
        </ShopLayout>
      </Layout>,
    )
  })
  .get('/account/orders', async (c) => {
    const user = await currentUser(c)
    if (!user) return c.redirect('/shop/login?redirect=/shop/account/orders')

    const orders = await OrderModel.byUser(user.id)
    return c.html(
      <Layout>
        <ShopLayout cartCount={cartCount(readCart(c))} user={user}>
          <OrdersList orders={orders} />
        </ShopLayout>
      </Layout>,
    )
  })
  .get('/login', async (c) => {
    if (await currentUser(c)) return c.redirect(safeRedirect(c.req.query('redirect')))
    return c.html(
      <Layout>
        <ShopLayout cartCount={cartCount(readCart(c))}>
          <LoginPage redirect={safeRedirect(c.req.query('redirect'))} />
        </ShopLayout>
      </Layout>,
    )
  })
  .post('/login', async (c) => {
    const body = await c.req.parseBody()
    const email = String(body.email ?? '').trim()
    const password = String(body.password ?? '')
    const redirect = safeRedirect(String(body.redirect ?? ''))

    const user = email ? await UserModel.byEmail(email) : undefined
    const valid = user ? await UserModel.verifyPassword(user, password) : false
    if (!user || !valid) {
      return c.html(
        <Layout>
          <ShopLayout cartCount={cartCount(readCart(c))}>
            <LoginPage redirect={redirect} error="Incorrect email or password." />
          </ShopLayout>
        </Layout>,
        400,
      )
    }

    await signIn(c, user.id)
    return c.redirect(redirect)
  })
  .get('/register', async (c) => {
    if (await currentUser(c)) return c.redirect(safeRedirect(c.req.query('redirect')))
    return c.html(
      <Layout>
        <ShopLayout cartCount={cartCount(readCart(c))}>
          <RegisterPage redirect={safeRedirect(c.req.query('redirect'))} />
        </ShopLayout>
      </Layout>,
    )
  })
  .post('/register', async (c) => {
    const body = await c.req.parseBody()
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim()
    const password = String(body.password ?? '')
    const redirect = safeRedirect(String(body.redirect ?? ''))

    const fieldError =
      !name || !email || password.length < 8
        ? 'Please fill in all fields. Password must be at least 8 characters.'
        : (await UserModel.byEmail(email))
          ? 'An account with that email already exists.'
          : undefined

    if (fieldError) {
      return c.html(
        <Layout>
          <ShopLayout cartCount={cartCount(readCart(c))}>
            <RegisterPage redirect={redirect} error={fieldError} />
          </ShopLayout>
        </Layout>,
        400,
      )
    }

    const user = await UserModel.create({ name, email, password })
    await signIn(c, user.id)
    return c.redirect(redirect)
  })
  .post('/logout', async (c) => {
    await signOut(c)
    return c.redirect('/shop')
  })
