import { eq } from 'drizzle-orm'
import { db } from '../db'
import { apiTokens, users } from '../db/schema'

const sha256 = (token: string) => new Bun.CryptoHasher('sha256').update(token).digest('hex')

export const ApiTokenModel = {
  // 32 random bytes = 256 bits; unguessable, so a fast hash (not bcrypt) is fine.
  // The "shp_" prefix makes leaked tokens easy to spot in logs and by secret scanners.
  create: async (userId: number, name: string) => {
    const token = `shp_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')}`
    await db.insert(apiTokens).values({ userId, name, tokenHash: sha256(token) })
    return token // shown once, never stored in plain text
  },
  user: async (token: string) => {
    const [row] = await db
      .select({ user: users })
      .from(apiTokens)
      .innerJoin(users, eq(apiTokens.userId, users.id))
      .where(eq(apiTokens.tokenHash, sha256(token)))
    return row?.user
  },
  revoke: (token: string) => db.delete(apiTokens).where(eq(apiTokens.tokenHash, sha256(token))),
}
