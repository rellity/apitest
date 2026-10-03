import type { FC, PropsWithChildren } from 'hono/jsx'
import type { User } from '../../db/schema'
import { ShoppingCartIcon, SearchIcon, StorefrontIcon, UserCircleIcon, SignOutIcon } from './icons'

export const CartBadge = ({ count }: { count: number }) => (
  <span
    id="cart-count"
    hx-swap-oob="true"
    class={
      count > 0
        ? 'absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold text-white'
        : 'hidden'
    }
  >
    {count}
  </span>
)

const AuthLinks = ({ user }: { user?: User }) =>
  user ? (
    <div class="flex shrink-0 items-center gap-3">
      {user.role === 'admin' && (
        <a
          href="/admin"
          class="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Admin
        </a>
      )}
      <a
        href="/shop/account/orders"
        class="hidden items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 sm:flex dark:text-zinc-300 dark:hover:text-zinc-100"
      >
        <UserCircleIcon class="size-4" />
        {user.name.split(' ')[0]}
      </a>
      <form method="post" action="/shop/logout">
        <button
          type="submit"
          aria-label="Log out"
          class="flex items-center gap-1.5 rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <SignOutIcon class="size-5" />
        </button>
      </form>
    </div>
  ) : (
    <div class="flex shrink-0 items-center gap-3 text-sm">
      <a href="/shop/login" class="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
        Log in
      </a>
      <a
        href="/shop/register"
        class="rounded-full bg-brand-600 px-3.5 py-1.5 font-medium text-white hover:bg-brand-700"
      >
        Sign up
      </a>
    </div>
  )

export const ShopLayout: FC<PropsWithChildren<{ cartCount: number; user?: User }>> = ({ children, cartCount, user }) => (
  <div class="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
    <header class="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div class="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <a href="/shop" class="flex shrink-0 items-center gap-2 font-display text-lg font-bold text-brand-600 dark:text-brand-400">
          <StorefrontIcon class="size-5" />
          shopilyo
        </a>
        <div class="relative min-w-0 flex-1 max-w-md">
          <SearchIcon class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            placeholder="Search products"
            hx-get="/shop/search"
            hx-trigger="input changed delay:300ms, search"
            hx-target="#product-grid"
            name="q"
            class="w-full rounded-lg border border-zinc-200 bg-zinc-100 py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-900"
          />
        </div>
        <a
          href="/shop/cart"
          aria-label="Cart"
          class="relative shrink-0 rounded-full p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <ShoppingCartIcon class="size-6" />
          <CartBadge count={cartCount} />
        </a>
        <AuthLinks user={user} />
      </div>
    </header>
    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    <footer class="border-t border-zinc-200 dark:border-zinc-800">
      <div class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex items-center gap-2 font-display text-base font-bold text-brand-600 dark:text-brand-400">
          <StorefrontIcon class="size-5" />
          shopilyo
        </div>
        <nav class="flex gap-6 text-sm text-zinc-500 dark:text-zinc-400">
          <a href="/shop" class="hover:text-zinc-900 dark:hover:text-zinc-100">
            Shop
          </a>
          <a href="/shop/cart" class="hover:text-zinc-900 dark:hover:text-zinc-100">
            Cart
          </a>
          <a href="/shop/account/orders" class="hover:text-zinc-900 dark:hover:text-zinc-100">
            Orders
          </a>
        </nav>
        <p class="text-sm text-zinc-400 dark:text-zinc-500">© {new Date().getFullYear()} shopilyo</p>
      </div>
    </footer>
    <div
      id="toast-region"
      class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    ></div>
  </div>
)
