import { prisma } from '@/lib/db';
import { respondWithStoredAsset } from '@/lib/media-response';

export const runtime = 'nodejs';

// Public asset alias: /api/assets/{assetId} mirrors /media/{id}.
export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) return new Response('Not found', { status: 404 });
  return respondWithStoredAsset(asset);
}
