import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import {
  ZONE_DEFAULTS,
  ZONE_KEYS,
  PLACEMENT_KIND,
  mergeZoneTexts,
  type ArtworkCategory,
  type ZoneKey,
  type ZoneTexts,
} from './zones';

export async function loadZoneTexts(): Promise<ZoneTexts> {
  const rows = await prisma.galleryRoom.findMany({
    where: { zoneKey: { in: [...ZONE_KEYS] } },
    select: { zoneKey: true, name: true, signTitle: true, signSubtitle: true },
  });
  return mergeZoneTexts(rows);
}

export async function saveZoneTexts(texts: ZoneTexts): Promise<void> {
  await prisma.$transaction(
    ZONE_KEYS.map((key) =>
      prisma.galleryRoom.upsert({
        where: { zoneKey: key },
        update: texts[key],
        create: { zoneKey: key, ...texts[key] },
      }),
    ),
  );
}

// Keeps at most one museum placement per artwork. Saving an artwork in the zone it already
// occupies keeps its position in the order. Moving it to another zone appends it to the end.
// Passing null removes the assignment, so the artwork goes back to automatic placement.
export async function setArtworkZone(
  tx: Prisma.TransactionClient,
  artworkId: string,
  category: ArtworkCategory,
  zone: ZoneKey | null,
): Promise<void> {
  const kind = PLACEMENT_KIND[category];
  let roomId: string | null = null;
  if (zone) {
    const room = await tx.galleryRoom.upsert({
      where: { zoneKey: zone },
      update: {},
      create: { zoneKey: zone, ...ZONE_DEFAULTS[zone] },
    });
    roomId = room.id;
  }

  const current = roomId
    ? await tx.galleryPlacement.findFirst({ where: { artworkId, roomId, kind } })
    : null;
  await tx.galleryPlacement.deleteMany({
    where: { artworkId, ...(current ? { id: { not: current.id } } : {}) },
  });
  if (!roomId || current) return;

  const last = await tx.galleryPlacement.findFirst({
    where: { roomId, kind },
    orderBy: { slot: 'desc' },
    select: { slot: true },
  });
  await tx.galleryPlacement.create({
    data: { artworkId, roomId, kind, slot: (last?.slot ?? -1) + 1 },
  });
}
