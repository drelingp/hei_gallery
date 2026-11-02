import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, assertCsrf } from '@/lib/auth';
import { settingsSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';

export async function GET() {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  return NextResponse.json({ settings });
}

export async function PUT(req: Request) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const form = await req.formData();
  await assertCsrf(String(form.get('csrf') ?? ''));
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const data = {
    ...parsed.data,
    paypalEmail: parsed.data.paypalEmail || null,
  };
  const updated = await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  await audit(s.userId, 'settings.update');
  return NextResponse.json({ settings: updated });
}
