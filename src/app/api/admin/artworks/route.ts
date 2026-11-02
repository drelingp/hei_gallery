import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, assertCsrf } from '@/lib/auth';
import { artworkSchema, slugify } from '@/lib/validation';
import { audit } from '@/lib/audit';

async function getAuthedSession() {
  const s = await getSession();
  return s.userId ? s : null;
}

export async function GET() {
  const s = await getAuthedSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const items = await prisma.artwork.findMany({
    include: { coverImage: true, modelAsset: true },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const s = await getAuthedSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const form = await req.formData();

    try {
      await assertCsrf(String(form.get('csrf') ?? ''));
    } catch {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const parsed = artworkSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        { status: 400 },
      );
    }

    const base = slugify(parsed.data.title) || 'work';
    let slug = base;
    let i = 1;
    while (await prisma.artwork.findUnique({ where: { slug } })) {
      slug = `${base}-${++i}`;
    }

    const created = await prisma.artwork.create({
      data: { ...parsed.data, slug },
    });

    await audit(s.userId!, 'artwork.create', created.id);
    return NextResponse.json({ item: created });
  } catch (error) {
    console.error('Failed to create artwork', error);
    return NextResponse.json({ error: 'Could not create artwork.' }, { status: 500 });
  }
}
