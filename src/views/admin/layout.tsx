import type { FC, PropsWithChildren } from 'hono/jsx'
import type { User } from '../../db/schema'
import { SignOutIcon, StorefrontIcon } from '../shop/icons'

const NAV = [
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/orders', label: 'Orders' },
] as const

// `active` only accepts one of the hrefs above, so a typo is a compile error.
export const AdminLayout: FC<PropsWithChildren<{ user: User; active: (typeof NAV)[number]['href'] }>> = ({
  children,
  user,
  active,
}) => (
  <div class="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
    <header class="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <a href="/admin" class="flex items-center gap-2 font-display font-bold text-brand-600 dark:text-brand-400">
          <StorefrontIcon class="size-5" />
          shopilyo <span class="font-normal text-zinc-400">admin</span>
        </a>
        <nav class="flex flex-1 gap-1 text-sm">
          {NAV.map((item) => (
            <a
              href={item.href}
              aria-current={item.href === active ? 'page' : undefined}
              class={
                item.href === active
                  ? 'rounded-md bg-zinc-100 px-3 py-1.5 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                  : 'rounded-md px-3 py-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }
            >
              {item.label}
            </a>
          ))}
        </nav>
        <a href="/shop" class="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          View shop
        </a>
        <span class="hidden text-sm text-zinc-400 sm:inline">{user.email}</span>
        <form method="post" action="/shop/logout">
          <button aria-label="Log out" class="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <SignOutIcon class="size-5" />
          </button>
        </form>
      </div>
    </header>
    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    <div
      id="toast-region"
      class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    ></div>
  </div>
)
