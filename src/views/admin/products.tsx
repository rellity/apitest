import type { Product } from '../../db/schema'
import type { ProductFormValues } from '../../lib/product-form'
import { formatCents } from '../../lib/money'
import { PlusIcon, TrashIcon } from '../shop/icons'

const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

export const ProductRow = ({ product }: { product: Product }) => (
  <tr id={`product-row-${product.id}`} class="border-t border-zinc-100 dark:border-zinc-800">
    <td class="py-3 pr-3">
      <img src={product.imageUrl} alt="" class="size-10 rounded-md object-cover" />
    </td>
    <td class="py-3 pr-3">
      <p class="font-medium text-zinc-900 dark:text-zinc-100">{product.name}</p>
      <p class="text-xs text-zinc-400">{product.slug}</p>
    </td>
    <td class="py-3 pr-3 text-zinc-500 dark:text-zinc-400">{product.category}</td>
    <td class="py-3 pr-3 text-right tabular-nums">{formatCents(product.priceCents)}</td>
    <td class={`py-3 pr-3 text-right tabular-nums ${product.stock === 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
      {product.stock}
    </td>
    <td class="py-3 pr-3 text-center">{product.featured ? '★' : ''}</td>
    <td class="whitespace-nowrap py-3 text-right">
      <a
        href={`/admin/products/${product.id}/edit`}
        class="rounded-md px-2 py-1 text-sm text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-zinc-800"
      >
        Edit
      </a>
      <button
        hx-delete={`/admin/products/${product.id}`}
        hx-confirm={`Delete ${product.name}?`}
        hx-target={`#product-row-${product.id}`}
        hx-swap="outerHTML"
        aria-label={`Delete ${product.name}`}
        class="rounded-md p-1.5 align-middle text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
      >
        <TrashIcon class="size-4" />
      </button>
    </td>
  </tr>
)

export const ProductsPage = ({ products }: { products: Product[] }) => (
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="font-display text-xl font-semibold">Products</h1>
      <a
        href="/admin/products/new"
        class="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        <PlusIcon class="size-4" /> New product
      </a>
    </div>
    <div class="overflow-x-auto rounded-xl border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
      <table class="w-full text-sm">
        <thead class="text-left text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            <th class="py-3 pr-3"></th>
            <th class="py-3 pr-3">Name</th>
            <th class="py-3 pr-3">Category</th>
            <th class="py-3 pr-3 text-right">Price</th>
            <th class="py-3 pr-3 text-right">Stock</th>
            <th class="py-3 pr-3 text-center">Featured</th>
            <th class="py-3 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <ProductRow product={product} />
          ))}
        </tbody>
      </table>
    </div>
  </div>
)

export const emptyProductForm: ProductFormValues = {
  name: '',
  slug: '',
  category: '',
  description: '',
  price: '',
  stock: '0',
  imageUrl: '',
  featured: '',
}

export const productToFormValues = (p: Product): ProductFormValues => ({
  name: p.name,
  slug: p.slug,
  category: p.category,
  description: p.description,
  price: (p.priceCents / 100).toFixed(2),
  stock: String(p.stock),
  imageUrl: p.imageUrl,
  featured: p.featured ? 'on' : '',
})

// `id` decides create vs update, so the form hits the right REST route:
// POST /admin/products creates, PUT /admin/products/:id replaces.
export const ProductForm = ({ id, values, error }: { id?: number; values: ProductFormValues; error?: string }) => {
  const method = id ? { 'hx-put': `/admin/products/${id}` } : { 'hx-post': '/admin/products' }
  return (
    <div class="mx-auto max-w-2xl space-y-4">
      <h1 class="font-display text-xl font-semibold">{id ? 'Edit product' : 'New product'}</h1>
      {error && (
        <p role="alert" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}
      <form
        {...method}
        hx-target="body"
        class="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <label class="block text-sm">
          <span class="text-zinc-600 dark:text-zinc-400">Name</span>
          <input name="name" required value={values.name} class={inputClass} />
        </label>
        <label class="block text-sm">
          <span class="text-zinc-600 dark:text-zinc-400">Slug (used in the URL)</span>
          <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={values.slug} class={inputClass} />
        </label>
        <label class="block text-sm">
          <span class="text-zinc-600 dark:text-zinc-400">Category</span>
          <input name="category" value={values.category} placeholder="General" class={inputClass} />
        </label>
        <label class="block text-sm">
          <span class="text-zinc-600 dark:text-zinc-400">Image URL</span>
          <input name="imageUrl" required value={values.imageUrl} class={inputClass} />
        </label>
        <label class="block text-sm">
          <span class="text-zinc-600 dark:text-zinc-400">Price (PHP)</span>
          <input name="price" required inputmode="decimal" value={values.price} class={inputClass} />
        </label>
        <label class="block text-sm">
          <span class="text-zinc-600 dark:text-zinc-400">Stock</span>
          <input name="stock" required type="number" min="0" value={values.stock} class={inputClass} />
        </label>
        <label class="block text-sm sm:col-span-2">
          <span class="text-zinc-600 dark:text-zinc-400">Description</span>
          <textarea name="description" rows={3} class={inputClass}>
            {values.description}
          </textarea>
        </label>
        <label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" name="featured" checked={values.featured === 'on'} class="accent-brand-600" />
          Featured on the home page
        </label>
        <div class="flex justify-end gap-2 sm:col-span-2">
          <a
            href="/admin/products"
            class="rounded-full px-5 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </a>
          <button class="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
            {id ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </form>
    </div>
  )
}
