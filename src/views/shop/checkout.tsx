import type { CartLine } from './cart'
import type { User } from '../../db/schema'
import { formatCents } from '../../lib/money'

const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

export const CheckoutPage = ({
  lines,
  subtotalCents,
  error,
  user,
}: {
  lines: CartLine[]
  subtotalCents: number
  error?: string
  user: User
}) => (
  <div class="grid gap-6 md:grid-cols-3">
    <div class="space-y-4 md:col-span-2">
      <h1 class="font-display text-xl font-semibold text-zinc-900 dark:text-zinc-100">Checkout</h1>
      {error && (
        <p class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>
      )}
      <form
        hx-post="/shop/checkout"
        hx-target="body"
        class="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block text-sm">
            <span class="text-zinc-600 dark:text-zinc-400">Full name</span>
            <input name="name" required value={user.name} class={inputClass} />
          </label>
          <label class="block text-sm">
            <span class="text-zinc-600 dark:text-zinc-400">Email</span>
            <input name="email" type="email" required value={user.email} class={inputClass} />
          </label>
          <label class="block text-sm">
            <span class="text-zinc-600 dark:text-zinc-400">Phone</span>
            <input name="phone" required class={inputClass} />
          </label>
          <label class="block text-sm">
            <span class="text-zinc-600 dark:text-zinc-400">City</span>
            <input name="city" required class={inputClass} />
          </label>
          <label class="block text-sm sm:col-span-2">
            <span class="text-zinc-600 dark:text-zinc-400">Delivery address</span>
            <textarea name="address" required rows={2} class={inputClass}></textarea>
          </label>
        </div>
        <fieldset class="space-y-2">
          <legend class="text-sm text-zinc-600 dark:text-zinc-400">Payment method</legend>
          <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="radio" name="payment" value="cod" checked class="accent-brand-600" />
            Cash on Delivery
          </label>
          <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="radio" name="payment" value="card" class="accent-brand-600" />
            Credit / Debit Card
          </label>
        </fieldset>
        <button class="w-full rounded-full bg-brand-600 px-6 py-3 font-medium text-white transition hover:bg-brand-700 active:scale-[0.98]">
          Place Order
        </button>
      </form>
    </div>
    <div class="h-fit space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 class="font-display font-medium text-zinc-900 dark:text-zinc-100">Order Summary</h2>
      {lines.map((line) => (
        <div class="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span>
            {line.product.name} × {line.quantity}
          </span>
          <span>{formatCents(line.product.priceCents * line.quantity)}</span>
        </div>
      ))}
      <div class="flex justify-between border-t border-zinc-100 pt-3 font-display font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
        <span>Total</span>
        <span>{formatCents(subtotalCents)}</span>
      </div>
    </div>
  </div>
)
