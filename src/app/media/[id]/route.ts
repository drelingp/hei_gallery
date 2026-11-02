import { prisma } from '@/lib/db';
import { respondWithStoredAsset } from '@/lib/media-response';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return new Response('Not found', { status: 404 });
  return respondWithStoredAsset(asset);
}
