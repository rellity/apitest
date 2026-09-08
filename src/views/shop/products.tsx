import type { FC } from 'hono/jsx'
import type { Product } from '../../db/schema'
import { formatCents } from '../../lib/money'
import { CpuIcon, TShirtIcon, HouseIcon, BarbellIcon, PackageIcon } from './icons'

const CATEGORY_ICONS: Record<string, FC<{ class?: string }>> = {
  Electronics: CpuIcon,
  Fashion: TShirtIcon,
  Home: HouseIcon,
  Fitness: BarbellIcon,
}

export const ProductCard = ({ product }: { product: Product }) => (
  <a
    href={`/shop/products/${product.slug}`}
    class="group block overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
  >
    <div class="relative aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-800">
      <img
        src={product.imageUrl}
        alt={product.name}
        loading="lazy"
        class={
          product.stock === 0
            ? 'h-full w-full object-cover opacity-40 grayscale'
            : 'h-full w-full object-cover transition duration-300 group-hover:scale-105'
        }
      />
      {product.stock === 0 && (
        <span class="absolute left-2 top-2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[11px] font-medium text-white">
          Sold out
        </span>
      )}
      {product.stock > 0 && product.stock <= 10 && (
        <span class="absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white">
          Only {product.stock} left
        </span>
      )}
    </div>
    <div class="space-y-1 p-3">
      <p class="truncate font-display text-sm font-medium text-zinc-900 dark:text-zinc-100">{product.name}</p>
      <p class="font-display text-base font-semibold text-brand-600 dark:text-brand-400">{formatCents(product.priceCents)}</p>
    </div>
  </a>
)

export const ProductGrid = ({ products }: { products: Product[] }) => (
  <div id="product-grid" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
    {products.length === 0 ? (
      <p class="col-span-full py-16 text-center text-zinc-400 dark:text-zinc-500">No products found.</p>
    ) : (
      products.map((p) => <ProductCard product={p} />)
    )}
  </div>
)

export const CategoryFilter = ({ categories, active }: { categories: string[]; active?: string }) => (
  <div class="mb-5 flex flex-wrap gap-2">
    <a
      href="/shop"
      class={
        !active
          ? 'flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white'
          : 'flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800'
      }
    >
      <PackageIcon class="size-4" />
      All
    </a>
    {categories.map((cat) => {
      const Icon = CATEGORY_ICONS[cat]
      return (
        <a
          href={`/shop?category=${encodeURIComponent(cat)}`}
          class={
            active === cat
              ? 'flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white'
              : 'flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800'
          }
        >
          {Icon && <Icon class="size-4" />}
          {cat}
        </a>
      )
    })}
  </div>
)
