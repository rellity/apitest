import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users, sessions, type User } from '../db/schema'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

export const UserModel = {
  byEmail: async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0],
  byId: async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0],
  create: async (input: { name: string; email: string; password: string }) => {
    const passwordHash = await Bun.password.hash(input.password)
    const [user] = await db
      .insert(users)
      .values({ name: input.name, email: input.email, passwordHash })
      .returning()
    if (!user) throw new Error('failed to create user')
    return user
  },
  verifyPassword: (user: User, password: string) => Bun.password.verify(password, user.passwordHash),
}

export const SessionModel = {
  create: async (userId: number) => {
    const id = crypto.randomUUID()
    await db.insert(sessions).values({ id, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
    return id
  },
  user: async (sessionId: string): Promise<User | undefined> => {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
    if (!session || session.expiresAt < new Date()) return
    return UserModel.byId(session.userId)
  },
  destroy: (sessionId: string) => db.delete(sessions).where(eq(sessions.id, sessionId)),
}
