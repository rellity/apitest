import { expect, test } from '@playwright/test'

// End-to-end: a real browser against the real server and database.
// Slow (seconds, not milliseconds), so they cover whole user journeys,
// the glue between htmx, Alpine, cookies, redirects and the database
// that unit and integration tests can't see.
//
// Locators use roles and labels (getByRole, getByLabel) like a screen
// reader would. If a test can't find a button by its name, neither can
// someone using assistive tech.

test('a guest finds a product, signs up, and checks out', async ({ page }) => {
  await page.goto('/shop')

  // htmx live search: typing swaps #product-grid without a page load.
  await page.getByPlaceholder('Search products').fill('lamp')
  const grid = page.locator('#product-grid')
  await expect(grid.getByRole('link')).toHaveCount(1)
  await grid.getByRole('link', { name: /Desk Lamp/ }).click()

  // Alpine: the +/- buttons change the quantity input on the client.
  await expect(page.getByText('5 in stock')).toBeVisible()
  await page.getByRole('button', { name: 'Increase quantity' }).click()
  await expect(page.locator('input[name=quantity]')).toHaveValue('2')
  await page.getByRole('button', { name: 'Add to Cart' }).click()

  // htmx out-of-band swaps: a toast and the header badge update together.
  await expect(page.getByRole('status')).toContainText('Added Desk Lamp to cart')
  await expect(page.locator('#cart-count')).toHaveText('2')

  await page.getByRole('link', { name: 'Cart' }).first().click()
  await page.getByRole('button', { name: 'Increase quantity' }).click()
  await expect(page.locator('#cart-summary')).toContainText('₱2,697.00') // 3 × ₱899

  // Checkout needs an account: login -> "create one" -> back to checkout.
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click()
  await expect(page).toHaveURL(/\/shop\/login\?redirect=/)
  await page.getByRole('link', { name: 'Create an account' }).click()
  await page.getByLabel('Full name').fill('Ana Cruz')
  await page.getByLabel('Email').fill(`ana-${Date.now()}@example.com`)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Create Account' }).click()
  await expect(page).toHaveURL('/shop/checkout')

  await page.getByLabel('Phone').fill('0917 000 0000')
  await page.getByLabel('City').fill('Manila')
  await page.getByLabel('Delivery address').fill('1 Rizal St')
  await page.getByRole('button', { name: 'Place Order' }).click()

  await expect(page).toHaveURL(/\/shop\/orders\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Order Placed' })).toBeVisible()
  await expect(page.locator('#cart-count')).toBeHidden()

  // The order really took stock.
  await page.goto('/shop/products/desk-lamp')
  await expect(page.getByText('2 in stock')).toBeVisible()
})

test.describe('admin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/shop\/login\?redirect=%2Fadmin/)
    await page.getByLabel('Email').fill('admin@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page).toHaveURL('/admin/products')
  })

  test('creates a product that shows up in the shop', async ({ page }) => {
    await page.getByRole('link', { name: 'New product' }).click()
    await page.getByLabel('Name').fill('Coffee Mug')
    await page.getByLabel('Slug').fill('coffee-mug')
    await page.getByLabel('Image URL').fill('/favicon.svg')
    await page.getByLabel('Price').fill('1,000') // invalid on purpose
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page.getByRole('alert')).toContainText('Price must be a number')
    // The form kept what we typed.
    await expect(page.getByLabel('Name')).toHaveValue('Coffee Mug')

    await page.getByLabel('Price').fill('349.50')
    await page.getByRole('button', { name: 'Create product' }).click()
    await expect(page).toHaveURL('/admin/products')
    await expect(page.getByRole('row', { name: /Coffee Mug/ })).toContainText('₱349.50')

    await page.goto('/shop/products/coffee-mug')
    await expect(page.getByRole('heading', { name: 'Coffee Mug' })).toBeVisible()
  })

  test('cancels an order placed through the API and restocks', async ({ page, request }) => {
    // Set up data through the JSON API: faster and sturdier than clicking
    // through the shop again. `request` shares nothing with `page`.
    const tokenRes = await request.post('/api/v1/tokens', {
      data: { email: 'admin@example.com', password: 'password123' },
    })
    const { data } = await tokenRes.json()
    const mat = (await (await request.get('/api/v1/products?q=yoga')).json()).data[0]
    const orderRes = await request.post('/api/v1/orders', {
      headers: { authorization: `Bearer ${data.token}` },
      data: {
        name: 'API Buyer', email: 'api@example.com', phone: '1', city: 'Cebu', address: '2 Colon St',
        items: [{ productId: mat.id, quantity: 2 }], // stock 5 -> 3
      },
    })
    expect(orderRes.status()).toBe(201)
    const order = (await orderRes.json()).data

    await page.getByRole('link', { name: 'Orders' }).click()
    const row = page.locator(`#order-row-${order.id}`)
    await expect(row).toContainText('placed')

    // hx-confirm opens a native confirm() dialog; accept it.
    page.once('dialog', (dialog) => dialog.accept())
    await row.getByRole('button', { name: 'Cancel' }).click()
    await expect(row).toContainText('cancelled')
    await expect(row.getByRole('button')).toHaveCount(0) // nothing left to do

    await page.getByRole('link', { name: 'Products' }).click()
    await expect(page.getByRole('row', { name: /Yoga Mat/ })).toContainText('5')
  })
})
