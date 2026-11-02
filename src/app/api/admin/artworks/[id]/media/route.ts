import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { prisma } from '@/lib/db';
import { getSession, assertCsrf } from '@/lib/auth';
import { storeUpload, deleteStored } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = rateLimit(clientKey(req, 'upload'), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });

  const { id } = await params;
  const artwork = await prisma.artwork.findUnique({
    where: { id },
    include: { coverImage: true, modelAsset: true },
  });
  if (!artwork) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const form = await req.formData();
  await assertCsrf(String(form.get('csrf') ?? ''));
  const kind = (String(form.get('kind') ?? 'IMAGE').toUpperCase() === 'MODEL_GLB'
    ? 'MODEL_GLB'
    : 'IMAGE') as 'IMAGE' | 'MODEL_GLB';
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });

  try {
    const stored = await storeUpload(file, kind);
    let width: number | undefined;
    let height: number | undefined;
    if (kind === 'IMAGE') {
      try {
        const m = await sharp(`${process.env.UPLOAD_DIR ?? './data/uploads'}/${stored.storedPath}`).metadata();
        width = m.width;
        height = m.height;
      } catch {
        // ignore metadata errors
      }
    }
    const asset = await prisma.mediaAsset.create({
      data: {
        kind,
        filename: stored.filename,
        storedPath: stored.storedPath,
        mimeType: stored.mimeType,
        bytes: stored.bytes,
        width,
        height,
      },
    });
    // Replace previous asset of the same kind.
    if (kind === 'IMAGE') {
      const prev = artwork.coverImage;
      await prisma.artwork.update({ where: { id }, data: { coverImageId: asset.id } });
      if (prev) {
        await prisma.mediaAsset.delete({ where: { id: prev.id } });
        await deleteStored(prev.storedPath);
      }
    } else {
      const prev = artwork.modelAsset;
      await prisma.artwork.update({ where: { id }, data: { modelAssetId: asset.id } });
      if (prev) {
        await prisma.mediaAsset.delete({ where: { id: prev.id } });
        await deleteStored(prev.storedPath);
      }
    }
    await audit(s.userId, 'artwork.upload', id, { kind, bytes: asset.bytes });
    return NextResponse.json({ asset });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
