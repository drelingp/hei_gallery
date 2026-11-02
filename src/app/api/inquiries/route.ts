import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { inquirySchema } from '@/lib/validation';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { getSession, assertCsrf } from '@/lib/auth';

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, 'inquiry'), 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const form = await req.formData();
  const session = await getSession();
  const csrf = req.headers.get('x-csrf-token') ?? String(form.get('csrf') ?? '');
  // CSRF: tie inquiry token to anonymous session cookie issued by /inquire.
  if (!session.csrf || session.csrf !== csrf) {
    return NextResponse.json({ error: 'Invalid session token' }, { status: 403 });
  }

  const parsed = inquirySchema.safeParse({
    artworkId: form.get('artworkId') || null,
    name: form.get('name'),
    email: form.get('email'),
    message: form.get('message'),
    website: form.get('website') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check the form fields.' }, { status: 400 });
  }
  if (parsed.data.website) {
    // Honeypot triggered; pretend success.
    return NextResponse.json({ ok: true });
  }
  const inquiry = await prisma.inquiry.create({
    data: {
      artworkId: parsed.data.artworkId || null,
      name: parsed.data.name,
      email: parsed.data.email,
      message: parsed.data.message,
    },
  });
  await audit(null, 'inquiry.create', inquiry.id);
  return NextResponse.json({ ok: true });
}

export const dynamic = 'force-dynamic';
