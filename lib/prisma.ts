/**
 * lib/prisma.ts
 * -----------------------------------------------------------------------------
 * Prisma client singleton. Next.js hot-reloads modules in development, so the
 * client is cached on `globalThis` to avoid exhausting the SQLite connection
 * pool with every edit.
 * -----------------------------------------------------------------------------
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
