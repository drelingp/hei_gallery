import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, assertCsrf } from '@/lib/auth';
import { artworkSchema } from '@/lib/validation';
import { deleteStored } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { setArtworkZone } from '@/lib/zone-store';
import { isZoneAllowed, isZoneKey, type ArtworkCategory, type ZoneKey } from '@/lib/zones';

async function requireAuth() {
  const s = await getSession();
  if (!s.userId) throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return s;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireAuth();
  const { id } = await params;
  const form = await req.formData();
  await assertCsrf(String(form.get('csrf') ?? ''));
  const parsed = artworkSchema.partial().safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  // Missing field: leave the museum placement unchanged. Empty value: automatic placement.
  const zoneField = form.has('museumZone') ? String(form.get('museumZone') ?? '') : null;
  const current = await prisma.artwork.findUnique({ where: { id }, select: { category: true } });
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const category = (parsed.data.category ?? current.category) as ArtworkCategory;
  let zone: ZoneKey | null = null;
  if (zoneField) {
    if (!isZoneKey(zoneField) || !isZoneAllowed(category, zoneField)) {
      return NextResponse.json({ error: 'This zone cannot hold this category' }, { status: 400 });
    }
    zone = zoneField;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.artwork.update({ where: { id }, data: parsed.data });
    if (zoneField !== null) await setArtworkZone(tx, id, category, zone);
    return item;
  });
  await audit(s.userId!, 'artwork.update', id);
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireAuth();
  const { id } = await params;
  const csrf = req.headers.get('x-csrf-token');
  await assertCsrf(csrf);
  const existing = await prisma.artwork.findUnique({
    where: { id },
    include: { coverImage: true, modelAsset: true },
  });
  if (!existing) return NextResponse.json({ ok: true });
  // Detach media before delete so cascading FK works clean.
  await prisma.artwork.update({
    where: { id },
    data: { coverImageId: null, modelAssetId: null },
  });
  if (existing.coverImage) {
    await prisma.mediaAsset.delete({ where: { id: existing.coverImage.id } });
    await deleteStored(existing.coverImage.storedPath);
  }
  if (existing.modelAsset) {
    await prisma.mediaAsset.delete({ where: { id: existing.modelAsset.id } });
    await deleteStored(existing.modelAsset.storedPath);
  }
  await prisma.artwork.delete({ where: { id } });
  await audit(s.userId!, 'artwork.delete', id);
  return NextResponse.json({ ok: true });
}
