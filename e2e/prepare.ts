// Runs before the e2e server starts: a fresh, known database every run.
import '../test/integration/setup'
import { eq } from 'drizzle-orm'
import { resetDb } from '../test/integration/helpers'
import { db } from '../src/db'
import { products, users } from '../src/db/schema'
import { UserModel } from '../src/models/user'

await resetDb()
// Local image: e2e tests shouldn't depend on the internet.
const image = '/favicon.svg'
await db.insert(products).values([
  { slug: 'desk-lamp', name: 'Desk Lamp', category: 'Home', priceCents: 89900, imageUrl: image, stock: 5 },
  { slug: 'yoga-mat', name: 'Yoga Mat', category: 'Fitness', priceCents: 79900, imageUrl: image, stock: 5 },
  { slug: 'earbuds', name: 'Wireless Earbuds', category: 'Electronics', priceCents: 249900, imageUrl: image, stock: 5 },
])
const admin = await UserModel.create({ name: 'Admin', email: 'admin@example.com', password: 'password123' })
await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
console.log('e2e database ready')
process.exit(0)
