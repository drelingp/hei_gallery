import { prisma } from './db';

export async function audit(
  userId: string | null,
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? undefined,
        action,
        target,
        meta: meta ? JSON.stringify(meta) : undefined,
      },
    });
  } catch {
    // Never let audit logging break the request.
  }
}
