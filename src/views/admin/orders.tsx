import type { Order, OrderStatus } from '../../db/schema'
import { formatCents } from '../../lib/money'
import { nextStatuses } from '../../models/order'

// Record<OrderStatus, ...>: forget a status and this won't compile.
const BADGE: Record<OrderStatus, string> = {
  placed: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  shipped: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  cancelled: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
}

const ACTION_LABEL: Record<OrderStatus, string> = {
  placed: 'Mark placed',
  shipped: 'Mark shipped',
  delivered: 'Mark delivered',
  cancelled: 'Cancel',
}

const formatDate = (d: Date) => new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

export const OrderRow = ({ order }: { order: Order }) => (
  <tr id={`order-row-${order.id}`} class="border-t border-zinc-100 dark:border-zinc-800">
    <td class="py-3 pr-3 font-medium">#{order.id}</td>
    <td class="py-3 pr-3">
      <p class="text-zinc-900 dark:text-zinc-100">{order.name}</p>
      <p class="text-xs text-zinc-400">{order.email}</p>
    </td>
    <td class="py-3 pr-3 text-zinc-500 dark:text-zinc-400">{formatDate(order.createdAt)}</td>
    <td class="py-3 pr-3 text-right tabular-nums">{formatCents(order.subtotalCents)}</td>
    <td class="py-3 pr-3">
      <span class={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${BADGE[order.status]}`}>
        {order.status}
      </span>
    </td>
    <td class="whitespace-nowrap py-3 text-right">
      {nextStatuses(order.status).map((to) => (
        <button
          hx-patch={`/admin/orders/${order.id}`}
          hx-vals={JSON.stringify({ status: to })}
          hx-target={`#order-row-${order.id}`}
          hx-swap="outerHTML"
          hx-confirm={to === 'cancelled' ? `Cancel order #${order.id} and put its items back in stock?` : undefined}
          class={
            to === 'cancelled'
              ? 'ml-1 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
              : 'ml-1 rounded-md px-2 py-1 text-sm text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-zinc-800'
          }
        >
          {ACTION_LABEL[to]}
        </button>
      ))}
    </td>
  </tr>
)

export const OrdersPage = ({ orders }: { orders: Order[] }) => (
  <div class="space-y-4">
    <h1 class="font-display text-xl font-semibold">Orders</h1>
    <div class="overflow-x-auto rounded-xl border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
      <table class="w-full text-sm">
        <thead class="text-left text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            <th class="py-3 pr-3">Order</th>
            <th class="py-3 pr-3">Customer</th>
            <th class="py-3 pr-3">Placed</th>
            <th class="py-3 pr-3 text-right">Total</th>
            <th class="py-3 pr-3">Status</th>
            <th class="py-3 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr>
              <td colspan={6} class="py-10 text-center text-zinc-400">
                No orders yet.
              </td>
            </tr>
          ) : (
            orders.map((order) => <OrderRow order={order} />)
          )}
        </tbody>
      </table>
    </div>
  </div>
)
