import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSession, assertCsrf } from '@/lib/auth';
import {
  allocateObjectKey,
  assertObjectKey,
  deleteStored,
  inspectUploadedObject,
  mimeTypeForKey,
  presignUpload,
  storeUpload,
  validateUploadMeta,
  type UploadKind,
} from '@/lib/storage';
import { audit } from '@/lib/audit';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const kindSchema = z.enum(['IMAGE', 'MODEL_GLB']);

const presignSchema = z.object({
  action: z.literal('presign'),
  csrf: z.string().min(1),
  kind: kindSchema,
  filename: z.string().min(1).max(200),
  mimeType: z.string().max(120).optional().default(''),
  bytes: z.number().int().positive(),
});

const completeSchema = z.object({
  action: z.literal('complete'),
  csrf: z.string().min(1),
  kind: kindSchema,
  filename: z.string().min(1).max(200),
  mimeType: z.string().max(120).optional().default(''),
  key: z.string().min(1).max(200),
});

const jsonSchema = z.discriminatedUnion('action', [presignSchema, completeSchema]);

async function loadArtwork(id: string) {
  return prisma.artwork.findUnique({
    where: { id },
    include: { coverImage: true, modelAsset: true },
  });
}

async function imageSize(body: Buffer | undefined) {
  if (!body) return { width: undefined, height: undefined };
  try {
    const m = await sharp(body).metadata();
    return { width: m.width, height: m.height };
  } catch {
    return { width: undefined, height: undefined };
  }
}

async function attachAsset(input: {
  artworkId: string;
  kind: UploadKind;
  filename: string;
  storedPath: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  previous: { id: string; storedPath: string } | null;
}) {
  const asset = await prisma.mediaAsset.create({
    data: {
      kind: input.kind,
      filename: input.filename,
      storedPath: input.storedPath,
      mimeType: input.mimeType,
      bytes: input.bytes,
      width: input.width,
      height: input.height,
    },
  });
  if (input.kind === 'IMAGE') {
    await prisma.artwork.update({ where: { id: input.artworkId }, data: { coverImageId: asset.id } });
  } else {
    await prisma.artwork.update({ where: { id: input.artworkId }, data: { modelAssetId: asset.id } });
  }
  if (input.previous) {
    await prisma.mediaAsset.delete({ where: { id: input.previous.id } });
    await deleteStored(input.previous.storedPath);
  }
  return asset;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = rateLimit(clientKey(req, 'upload'), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });

  const { id } = await params;
  const artwork = await loadArtwork(id);
  if (!artwork) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return handleDirectUpload(req, artwork, s.userId);
  }
  return handleMultipart(req, artwork, s.userId);
}

async function handleDirectUpload(
  req: Request,
  artwork: NonNullable<Awaited<ReturnType<typeof loadArtwork>>>,
  userId: string,
) {
  const parsed = jsonSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  await assertCsrf(parsed.data.csrf);

  const previous =
    parsed.data.kind === 'IMAGE'
      ? artwork.coverImage
        ? { id: artwork.coverImage.id, storedPath: artwork.coverImage.storedPath }
        : null
      : artwork.modelAsset
        ? { id: artwork.modelAsset.id, storedPath: artwork.modelAsset.storedPath }
        : null;

  try {
    if (parsed.data.action === 'presign') {
      const meta = validateUploadMeta(parsed.data);
      const key = allocateObjectKey(parsed.data.kind, meta.ext);
      const signed = await presignUpload(key, meta.mimeType);
      return NextResponse.json({
        key,
        uploadUrl: signed.uploadUrl,
        headers: signed.headers,
        method: 'PUT',
      });
    }

    const key = assertObjectKey(parsed.data.key, parsed.data.kind);
    const taken = await prisma.mediaAsset.findFirst({ where: { storedPath: key }, select: { id: true } });
    if (taken) throw new Error('That file is already attached.');
    const inspected = await inspectUploadedObject(key, parsed.data.kind);
    const mimeType = mimeTypeForKey(key, parsed.data.kind);
    const meta = validateUploadMeta({
      kind: parsed.data.kind,
      filename: parsed.data.filename,
      mimeType,
      bytes: inspected.bytes,
    });
    if (!key.endsWith(meta.ext)) {
      await deleteStored(key);
      throw new Error('File extension does not match the uploaded object.');
    }
    const dims = parsed.data.kind === 'IMAGE' ? await imageSize(inspected.body) : undefined;
    const asset = await attachAsset({
      artworkId: artwork.id,
      kind: parsed.data.kind,
      filename: meta.filename,
      storedPath: key,
      mimeType,
      bytes: inspected.bytes,
      width: dims?.width,
      height: dims?.height,
      previous,
    });
    await audit(userId, 'artwork.upload', artwork.id, { kind: parsed.data.kind, bytes: asset.bytes, via: 'presign' });
    return NextResponse.json({ asset });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

async function handleMultipart(
  req: Request,
  artwork: NonNullable<Awaited<ReturnType<typeof loadArtwork>>>,
  userId: string,
) {
  const form = await req.formData();
  await assertCsrf(String(form.get('csrf') ?? ''));
  const kind = (String(form.get('kind') ?? 'IMAGE').toUpperCase() === 'MODEL_GLB'
    ? 'MODEL_GLB'
    : 'IMAGE') as UploadKind;
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const previous =
    kind === 'IMAGE'
      ? artwork.coverImage
        ? { id: artwork.coverImage.id, storedPath: artwork.coverImage.storedPath }
        : null
      : artwork.modelAsset
        ? { id: artwork.modelAsset.id, storedPath: artwork.modelAsset.storedPath }
        : null;

  try {
    const stored = await storeUpload(file, kind);
    const dims = kind === 'IMAGE' ? await imageSize(stored.body) : undefined;
    const asset = await attachAsset({
      artworkId: artwork.id,
      kind,
      filename: stored.filename,
      storedPath: stored.storedPath,
      mimeType: stored.mimeType,
      bytes: stored.bytes,
      width: dims?.width,
      height: dims?.height,
      previous,
    });
    await audit(userId, 'artwork.upload', artwork.id, { kind, bytes: asset.bytes, via: 'multipart' });
    return NextResponse.json({ asset });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
