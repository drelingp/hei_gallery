import { PrismaClient } from '@prisma/client';

/**
 * Neon’s pooled endpoint is PgBouncer in transaction mode. Prisma needs
 * `pgbouncer=true` there (disables prepared statements that the pooler
 * cannot keep) and a small per-isolate pool. Direct URLs are left alone
 * so local Postgres and `migrate deploy` keep working.
 */
export function withNeonPoolParams(connectionString: string | undefined) {
  if (!connectionString) return undefined;
  try {
    const url = new URL(connectionString);
    const pooled = url.hostname.includes('-pooler');
    if (pooled) {
      if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true');
      if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
    }
    if (url.hostname.endsWith('.neon.tech') && !url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'require');
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

const databaseUrl = withNeonPoolParams(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// One client per isolate. Next.js dev re-imports this module on HMR, and a
// warm Vercel isolate reuses the same module scope. Neon’s pooler is what
// caps connections across isolates — Prisma Accelerate is not required.
globalForPrisma.__prisma = prisma;
