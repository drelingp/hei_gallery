import { prisma } from '@/lib/db';
import { loadZoneTexts } from '@/lib/zone-store';
import { isZoneAllowed, isZoneKey, resolveZone } from '@/lib/zones';
import Museum3DClient from '@/components/gallery3d/Museum3DClient';

export const dynamic = 'force-dynamic';

export default async function MuseumPage() {
  const [works, zones] = await Promise.all([
    prisma.artwork.findMany({
      where: { status: 'PUBLISHED' },
      include: {
        coverImage: true,
        modelAsset: true,
        placements: { select: { slot: true, room: { select: { zoneKey: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    loadZoneTexts(),
  ]);

  const url = (id: string) => `/api/assets/${id}`;

  // Works assigned to a zone come first, in slot order. The rest keep their createdAt order.
  const ranked = works
    .map((w) => {
      const placement = w.placements.find((p) => p.room.zoneKey);
      const assigned = placement?.room.zoneKey;
      const pinned = assigned && isZoneKey(assigned) && isZoneAllowed(w.category, assigned) ? assigned : null;
      return {
        w,
        zone: resolveZone(w.category, w.slug, pinned),
        order: pinned && placement ? placement.slot : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.order - b.order);

  const drawings = ranked
    .filter(({ w, zone }) => zone === 'drawings' && w.coverImage)
    .map(({ w }) => ({
      id: w.id,
      slug: w.slug,
      title: w.title,
      imageUrl: url(w.coverImage!.id),
    }));

  const crafts = ranked
    .filter(({ zone }) => zone === 'crafts')
    .map(({ w }) => ({
      id: w.id,
      slug: w.slug,
      title: w.title,
      modelUrl: w.modelAsset ? url(w.modelAsset.id) : null,
      imageUrl: w.coverImage ? url(w.coverImage.id) : null,
    }));

  const scans = ranked
    .filter(({ zone }) => zone === 'scans')
    .map(({ w }) => ({
      id: w.id,
      slug: w.slug,
      title: w.title,
      modelUrl: w.modelAsset ? url(w.modelAsset.id) : null,
      imageUrl: w.coverImage ? url(w.coverImage.id) : null,
    }));

  return (
    <div className="fixed inset-0 overflow-hidden bg-stone text-bone">
      <Museum3DClient drawings={drawings} crafts={crafts} scans={scans} zones={zones} />
    </div>
  );
}

export const metadata = {
  title: '3D Museum',
  description: 'Walk through the gallery with mouse and keyboard, or touch on mobile.',
};
