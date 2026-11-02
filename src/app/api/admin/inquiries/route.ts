import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, assertCsrf } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { z } from 'zod';

const statusSchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'INVOICE_SENT', 'SOLD', 'CLOSED']),
});

async function requireAuth() {
  const s = await getSession();
  if (!s.userId) throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return s;
}

export async function GET() {
  await requireAuth();
  const items = await prisma.inquiry.findMany({
    include: { artwork: { select: { id: true, title: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ items });
}

export async function PATCH(req: Request) {
  const s = await requireAuth();
  const form = await req.formData();
  await assertCsrf(String(form.get('csrf') ?? ''));
  const id = String(form.get('id') ?? '');
  const parsed = statusSchema.safeParse({ status: form.get('status') });
  if (!id || !parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const updated = await prisma.inquiry.update({ where: { id }, data: { status: parsed.data.status } });
  await audit(s.userId!, 'inquiry.status', id, { status: parsed.data.status });
  return NextResponse.json({ item: updated });
}
