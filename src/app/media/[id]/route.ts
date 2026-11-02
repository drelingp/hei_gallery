import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readStored } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
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
