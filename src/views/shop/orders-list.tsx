import type { Order } from '../../db/schema'
import { formatCents } from '../../lib/money'
import { PackageIcon } from './icons'

const formatDate = (d: Date) => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })

export const OrdersList = ({ orders }: { orders: Order[] }) => (
  <div class="space-y-4">
    <h1 class="font-display text-xl font-semibold text-zinc-900 dark:text-zinc-100">My Orders</h1>
    {orders.length === 0 ? (
      <p class="rounded-xl border border-zinc-200 bg-white p-10 text-center text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
        No orders yet.{' '}
        <a href="/shop" class="text-brand-600 hover:underline dark:text-brand-400">
          Browse products
        </a>
      </p>
    ) : (
      <div class="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white px-4 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {orders.map((order) => (
          <a href={`/shop/orders/${order.id}`} class="flex items-center gap-4 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <PackageIcon class="size-5" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="font-medium text-zinc-900 dark:text-zinc-100">Order #{order.id}</p>
              <p class="text-sm text-zinc-500 dark:text-zinc-400">{formatDate(order.createdAt)}</p>
            </div>
            <div class="text-right">
              <p class="font-display font-semibold text-zinc-900 dark:text-zinc-100">{formatCents(order.subtotalCents)}</p>
              <p class="text-sm capitalize text-zinc-500 dark:text-zinc-400">{order.status}</p>
            </div>
          </a>
        ))}
      </div>
    )}
  </div>
)
