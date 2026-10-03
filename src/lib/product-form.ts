import type { ProductInput } from '../models/product'

export const PRODUCT_FIELDS = ['name', 'slug', 'category', 'description', 'price', 'stock', 'imageUrl', 'featured'] as const
export type ProductFormValues = Record<(typeof PRODUCT_FIELDS)[number], string>

// A discriminated union: the caller must check `ok` before TypeScript lets it
// touch `data` or `error`. No "maybe it's valid" objects floating around.
// `values` (what the user typed) is on both sides, for re-rendering the form.
export type ParseResult =
  | { ok: true; data: ProductInput; values: ProductFormValues }
  | { ok: false; error: string; values: ProductFormValues }

export const toFormValues = (body: Record<string, unknown>): ProductFormValues =>
  Object.fromEntries(PRODUCT_FIELDS.map((f) => [f, typeof body[f] === 'string' ? body[f].trim() : ''])) as ProductFormValues

export const parseProductForm = (body: Record<string, unknown>): ParseResult => {
  const values = toFormValues(body)
  const fail = (error: string): ParseResult => ({ ok: false, error, values })

  if (!values.name) return fail('Name is required.')
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(values.slug)) return fail('Slug must be lowercase letters, numbers and dashes.')
  // Money as a string "1499.50" -> integer cents. Never store money as a float.
  // Digit limits keep values inside Postgres `integer` (max ~2.1 billion).
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(values.price)) return fail('Price must be a number like 1499 or 1499.50.')
  if (!/^\d{1,6}$/.test(values.stock)) return fail('Stock must be a whole number up to 999999.')
  if (!/^(https?:\/\/|\/)/.test(values.imageUrl)) return fail('Image URL must start with http(s):// or /.')

  return {
    ok: true,
    values,
    data: {
      name: values.name,
      slug: values.slug,
      category: values.category || 'General',
      description: values.description,
      priceCents: Math.round(Number(values.price) * 100),
      stock: Number(values.stock),
      imageUrl: values.imageUrl,
      featured: values.featured === 'on',
    },
  }
}
