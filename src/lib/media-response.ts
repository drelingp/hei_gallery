import { NextResponse } from 'next/server';
import { publicObjectUrl, readStored } from './storage';

type Asset = {
  storedPath: string;
  mimeType: string;
  filename: string;
};

/**
 * Prefer a redirect to the public R2 URL. Proxying bytes through a Vercel
 * function hits the 4.5 MB response cap, which cuts off GLB models.
 * When R2_PUBLIC_URL is unset, stream the object (local/Docker fallback).
 */
export async function respondWithStoredAsset(asset: Asset) {
  const pub = publicObjectUrl(asset.storedPath);
  if (pub) {
    return NextResponse.redirect(pub, {
      status: 307,
      headers: {
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  try {
    const buf = await readStored(asset.storedPath);
    const filename = asset.filename.replace(/"/g, '');
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': asset.mimeType || 'application/octet-stream',
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
