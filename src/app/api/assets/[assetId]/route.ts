import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readStored } from '@/lib/storage';

export const runtime = 'nodejs';

// Public asset alias: /api/assets/{assetId} mirrors /media/{id}.
export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) return new NextResponse('Not found', { status: 404 });
  try {
    const buf = await readStored(asset.storedPath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': asset.mimeType || 'application/octet-stream',
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename="${asset.filename.replace(/"/g, '')}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
