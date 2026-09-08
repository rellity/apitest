export const formatCents = (cents: number) =>
  (cents / 100).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
