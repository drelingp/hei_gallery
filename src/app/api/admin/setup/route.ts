import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { adminExists, getSession, hashPassword } from '@/lib/auth';
import { setupSchema } from '@/lib/validation';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, 'setup'), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  if (await adminExists()) {
    return NextResponse.json({ error: 'Setup already completed.' }, { status: 409 });
  }
  const form = await req.formData();
  const parsed = setupSchema.safeParse({
    email: form.get('email'),
    name: form.get('name'),
    password: form.get('password'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      role: 'ADMIN',
    },
  });
  await prisma.siteSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.role = user.role as 'ADMIN' | 'EDITOR';
  await session.save();
  await audit(user.id, 'admin.setup');
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ready: await adminExists() });
}

export const dynamic = 'force-dynamic';
