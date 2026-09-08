import type { Product } from '../../db/schema'
import { formatCents } from '../../lib/money'
import { CaretLeftIcon, MinusIcon, PlusIcon } from './icons'

export const ProductDetail = ({ product }: { product: Product }) => (
  <div class="space-y-6">
    <a
      href="/shop"
      class="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
    >
      <CaretLeftIcon class="size-4" />
      Back to shop
    </a>
    <div class="grid gap-8 md:grid-cols-2">
      <div class="aspect-square overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
        <img src={product.imageUrl} alt={product.name} class="h-full w-full object-cover" />
      </div>
      <div class="space-y-4">
        <p class="text-sm text-zinc-500 dark:text-zinc-400">{product.category}</p>
        <h1 class="font-display text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{product.name}</h1>
        <p class="font-display text-3xl font-bold text-brand-600 dark:text-brand-400">{formatCents(product.priceCents)}</p>
        <p class="max-w-prose text-zinc-600 dark:text-zinc-400">{product.description}</p>
        <p class="text-sm text-zinc-500 dark:text-zinc-400">
          {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
        </p>

        {product.stock > 0 ? (
          <form x-data="{ qty: 1 }" hx-post="/shop/cart/items" hx-swap="none" class="space-y-4 pt-2">
            <input type="hidden" name="productId" value={product.id} />
            <div class="flex items-center gap-3">
              <span class="text-sm text-zinc-500 dark:text-zinc-400">Quantity</span>
              <div class="flex items-center rounded-lg border border-zinc-300 dark:border-zinc-700">
                <button
                  type="button"
                  x-on:click="qty = Math.max(1, qty - 1)"
                  aria-label="Decrease quantity"
                  class="p-2 text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <MinusIcon class="size-4" />
                </button>
                <input
                  {...{ 'x-model.number': 'qty' }}
                  name="quantity"
                  type="number"
                  min="1"
                  max={product.stock}
                  class="w-12 border-x border-zinc-300 bg-transparent py-1 text-center focus:outline-none dark:border-zinc-700"
                />
                <button
                  type="button"
                  x-on:click={`qty = Math.min(${product.stock}, qty + 1)`}
                  aria-label="Increase quantity"
                  class="p-2 text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <PlusIcon class="size-4" />
                </button>
              </div>
            </div>
            <button class="w-full rounded-full bg-brand-600 px-6 py-3 font-medium text-white transition hover:bg-brand-700 active:scale-[0.98] sm:w-auto">
              Add to Cart
            </button>
          </form>
        ) : (
          <button disabled class="cursor-not-allowed rounded-full bg-zinc-200 px-6 py-3 font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
            Out of Stock
          </button>
        )}
      </div>
    </div>
  </div>
)
