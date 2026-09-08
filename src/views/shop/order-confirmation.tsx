import type { Order, OrderItem } from '../../db/schema'
import { formatCents } from '../../lib/money'
import { CheckCircleIcon } from './icons'

export const OrderConfirmation = ({ order }: { order: Order & { items: OrderItem[] } }) => (
  <div class="mx-auto max-w-xl space-y-6 rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
    <div class="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
      <CheckCircleIcon class="size-8" />
    </div>
    <div>
      <h1 class="font-display text-xl font-semibold text-zinc-900 dark:text-zinc-100">Order Placed</h1>
      <p class="text-zinc-500 dark:text-zinc-400">
        Order #{order.id} confirmed. A receipt has been sent to {order.email}.
      </p>
    </div>
    <div class="space-y-2 rounded-lg bg-zinc-50 p-4 text-left text-sm dark:bg-zinc-800/50">
      {order.items.map((item) => (
        <div class="flex justify-between text-zinc-600 dark:text-zinc-400">
          <span>
            {item.name} × {item.quantity}
          </span>
          <span>{formatCents(item.priceCents * item.quantity)}</span>
        </div>
      ))}
      <div class="flex justify-between border-t border-zinc-200 pt-2 font-display font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
        <span>Total</span>
        <span>{formatCents(order.subtotalCents)}</span>
      </div>
    </div>
    <p class="text-sm text-zinc-500 dark:text-zinc-400">
      Shipping to {order.address}, {order.city}
    </p>
    <a
      href="/shop"
      class="inline-block rounded-full bg-brand-600 px-6 py-3 font-medium text-white transition hover:bg-brand-700"
    >
      Continue Shopping
    </a>
  </div>
)
