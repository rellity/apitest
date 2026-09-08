import type { Product } from '../../db/schema'
import { ProductCard } from './products'

export const FeaturedSection = ({ products }: { products: Product[] }) => {
  if (products.length === 0) return null
  return (
    <div class="mb-6">
      <h2 class="mb-3 font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">Featured</h2>
      <div class="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {products.map((p) => (
          <div class="w-44 shrink-0 snap-start sm:w-52">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </div>
  )
}
