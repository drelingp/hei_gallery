import { prisma } from '@/lib/db';
import Museum3DClient from '@/components/gallery3d/Museum3DClient';

export const dynamic = 'force-dynamic';

export default async function MuseumPage() {
  const works = await prisma.artwork.findMany({
    where: { status: 'PUBLISHED' },
    include: { coverImage: true, modelAsset: true },
    orderBy: { createdAt: 'asc' },
  });

  const url = (id: string) => `/api/assets/${id}`;
  // Slug convention: any artwork whose slug starts with "scan-" lives in the scan showcase.
  const isScan = (slug: string) => slug.toLowerCase().startsWith('scan-');

  const drawings = works
    .filter((w) => w.category === 'DRAWING' && w.coverImage)
    .map((w) => ({
      id: w.id,
      slug: w.slug,
      title: w.title,
      imageUrl: url(w.coverImage!.id),
    }));

  const crafts = works
    .filter((w) => w.category === 'CERAMIC' && !isScan(w.slug))
    .map((w) => ({
      id: w.id,
      slug: w.slug,
      title: w.title,
      modelUrl: w.modelAsset ? url(w.modelAsset.id) : null,
      imageUrl: w.coverImage ? url(w.coverImage.id) : null,
    }));

  const scans = works
    .filter((w) => w.category === 'CERAMIC' && isScan(w.slug))
    .map((w) => ({
      id: w.id,
      slug: w.slug,
      title: w.title,
      modelUrl: w.modelAsset ? url(w.modelAsset.id) : null,
      imageUrl: w.coverImage ? url(w.coverImage.id) : null,
    }));

  return (
    <div className="fixed inset-0 overflow-hidden bg-stone text-bone">
      <Museum3DClient drawings={drawings} crafts={crafts} scans={scans} />
    </div>
  );
}

export const metadata = {
  title: '3D Museum',
  description: 'Walk through the gallery with mouse and keyboard, or touch on mobile.',
};
