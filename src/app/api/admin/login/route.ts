import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, verifyPassword } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, 'login'), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts. Try later.' }, { status: 429 });

  const form = await req.formData();
  const parsed = loginSchema.safeParse({
    email: form.get('email'),
    password: form.get('password'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await audit(null, 'admin.login.failed', parsed.data.email);
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.role = user.role as 'ADMIN' | 'EDITOR';
  await session.save();
  await audit(user.id, 'admin.login');
  return NextResponse.json({ ok: true });
}

export const dynamic = 'force-dynamic';
