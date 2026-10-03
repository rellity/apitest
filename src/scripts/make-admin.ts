// Usage: bun run admin:grant someone@example.com
// Promoting users is done from a trusted shell, never from a web form.
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'

const email = process.argv[2]
if (!email) {
  console.error('usage: bun run admin:grant <email>')
  process.exit(1)
}
const [user] = await db.update(users).set({ role: 'admin' }).where(eq(users.email, email)).returning()
console.log(user ? `${user.email} is now an admin` : `no user with email ${email}`)
process.exit(user ? 0 : 1)
