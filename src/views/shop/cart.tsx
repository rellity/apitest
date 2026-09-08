import type { Product } from '../../db/schema'
import { formatCents } from '../../lib/money'
import { MinusIcon, PlusIcon, TrashIcon } from './icons'

export type CartLine = { product: Product; quantity: number }

export const CartLineRow = ({ line }: { line: CartLine }) => (
  <div id={`cart-line-${line.product.id}`} class="flex items-center gap-4 py-4">
    <img src={line.product.imageUrl} alt={line.product.name} class="size-20 rounded-lg object-cover" />
    <div class="min-w-0 flex-1 space-y-1">
      <a
        href={`/shop/products/${line.product.slug}`}
        class="font-display font-medium text-zinc-900 hover:text-brand-600 dark:text-zinc-100 dark:hover:text-brand-400"
      >
        {line.product.name}
      </a>
      <p class="text-sm text-zinc-500 dark:text-zinc-400">{formatCents(line.product.priceCents)} each</p>
    </div>
    <div class="flex items-center rounded-lg border border-zinc-300 dark:border-zinc-700">
      <button
        hx-patch={`/shop/cart/items/${line.product.id}`}
        hx-vals={JSON.stringify({ quantity: line.quantity - 1 })}
        hx-target={`#cart-line-${line.product.id}`}
        hx-swap="outerHTML"
        aria-label="Decrease quantity"
        class="p-2 text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <MinusIcon class="size-4" />
      </button>
      <span class="w-8 text-center text-sm">{line.quantity}</span>
      <button
        hx-patch={`/shop/cart/items/${line.product.id}`}
        hx-vals={JSON.stringify({ quantity: line.quantity + 1 })}
        hx-target={`#cart-line-${line.product.id}`}
        hx-swap="outerHTML"
        aria-label="Increase quantity"
        class="p-2 text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <PlusIcon class="size-4" />
      </button>
    </div>
    <p class="w-24 shrink-0 text-right font-display font-semibold text-zinc-900 dark:text-zinc-100">
      {formatCents(line.product.priceCents * line.quantity)}
    </p>
    <button
      hx-delete={`/shop/cart/items/${line.product.id}`}
      hx-target={`#cart-line-${line.product.id}`}
      hx-swap="outerHTML swap:200ms"
      class="shrink-0 rounded-full p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
      aria-label="Remove"
    >
      <TrashIcon class="size-4" />
    </button>
  </div>
)

export const CartSummary = ({ subtotalCents }: { subtotalCents: number }) => (
  <div
    id="cart-summary"
    hx-swap-oob="true"
    class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
  >
    <div class="flex justify-between text-zinc-600 dark:text-zinc-400">
      <span>Subtotal</span>
      <span>{formatCents(subtotalCents)}</span>
    </div>
    <div class="flex justify-between border-t border-zinc-100 pt-3 font-display font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
      <span>Total</span>
      <span>{formatCents(subtotalCents)}</span>
    </div>
    {subtotalCents > 0 ? (
      <a
        href="/shop/checkout"
        class="block rounded-full bg-brand-600 px-4 py-3 text-center font-medium text-white transition hover:bg-brand-700"
      >
        Proceed to Checkout
      </a>
    ) : (
      <a
        href="/shop"
        class="block rounded-full bg-zinc-100 px-4 py-3 text-center font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
      >
        Continue Shopping
      </a>
    )}
  </div>
)

export const CartPage = ({ lines, subtotalCents }: { lines: CartLine[]; subtotalCents: number }) => (
  <div class="grid gap-6 md:grid-cols-3">
    <div class="md:col-span-2">
      <h1 class="mb-4 font-display text-xl font-semibold text-zinc-900 dark:text-zinc-100">Your Cart</h1>
      {lines.length === 0 ? (
        <p class="rounded-xl border border-zinc-200 bg-white p-10 text-center text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          Your cart is empty.{' '}
          <a href="/shop" class="text-brand-600 hover:underline dark:text-brand-400">
            Browse products
          </a>
        </p>
      ) : (
        <div class="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white px-4 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {lines.map((line) => <CartLineRow line={line} />)}
        </div>
      )}
    </div>
    <div>
      <CartSummary subtotalCents={subtotalCents} />
    </div>
  </div>
)
