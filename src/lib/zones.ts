// Museum zones: the rooms of the 3D museum whose text admins can edit, and the
// rules for which artworks can be assigned to each zone.
// Pure module (no server imports) so client components can use it too.

export const ZONE_KEYS = ['lobby', 'drawings', 'crafts', 'scans', 'export'] as const;
export type ZoneKey = (typeof ZONE_KEYS)[number];

export type ArtworkCategory = 'DRAWING' | 'CERAMIC';

export type ZoneText = {
  // Shown on the minimap and on corridor direction signs.
  name: string;
  // Main line of the wall sign inside the zone.
  signTitle: string;
  // Optional second line of the wall sign. Empty means no second line.
  signSubtitle: string;
};

export type ZoneTexts = Record<ZoneKey, ZoneText>;

export const ZONE_LABELS: Record<ZoneKey, string> = {
  lobby: 'Entrance lobby',
  drawings: 'Drawing gallery',
  crafts: '3D crafting hall',
  scans: 'Scan showcase',
  export: 'Export & AR room',
};

// Built-in text, used for any zone that has not been saved yet.
export const ZONE_DEFAULTS: ZoneTexts = {
  lobby: { name: 'Entrance Lobby', signTitle: 'Hei Gallery', signSubtitle: 'welcome' },
  drawings: { name: 'Drawing Gallery', signTitle: 'Drawing Gallery', signSubtitle: '' },
  crafts: { name: '3D Crafting Hall', signTitle: '3D Crafting Hall', signSubtitle: '' },
  scans: { name: 'Scan Showcase', signTitle: 'Scan Showcase', signSubtitle: '' },
  export: { name: 'Export & AR Room', signTitle: 'Export & AR', signSubtitle: 'coming soon' },
};

// Zones that can hold artworks, per category. The lobby and export room show none.
export const ASSIGNABLE_ZONES: Record<ArtworkCategory, readonly ZoneKey[]> = {
  DRAWING: ['drawings'],
  CERAMIC: ['crafts', 'scans'],
};

// GalleryPlacement.kind used for each category.
export const PLACEMENT_KIND: Record<ArtworkCategory, 'WALL' | 'PEDESTAL'> = {
  DRAWING: 'WALL',
  CERAMIC: 'PEDESTAL',
};

export function isZoneKey(value: string): value is ZoneKey {
  return (ZONE_KEYS as readonly string[]).includes(value);
}

export function isZoneAllowed(category: string, zone: ZoneKey): boolean {
  const allowed: readonly ZoneKey[] = ASSIGNABLE_ZONES[category as ArtworkCategory] ?? [];
  return allowed.includes(zone);
}

// Builds the zone texts from stored rows. Missing zones fall back to the defaults.
export function mergeZoneTexts(
  rows: { zoneKey: string | null; name: string; signTitle: string; signSubtitle: string }[],
): ZoneTexts {
  const merged: ZoneTexts = { ...ZONE_DEFAULTS };
  for (const row of rows) {
    if (!row.zoneKey || !isZoneKey(row.zoneKey)) continue;
    const fallback = ZONE_DEFAULTS[row.zoneKey];
    merged[row.zoneKey] = {
      name: row.name || fallback.name,
      signTitle: row.signTitle || fallback.signTitle,
      signSubtitle: row.signSubtitle,
    };
  }
  return merged;
}

// Zone an artwork is displayed in. An explicit assignment wins when it is allowed for the
// category. Otherwise the automatic rule applies: drawings go to the drawing gallery, and
// ceramics go to the scan showcase when the slug starts with "scan-", else to the crafting hall.
export function resolveZone(category: string, slug: string, assigned: ZoneKey | null): ZoneKey | null {
  if (assigned && isZoneAllowed(category, assigned)) return assigned;
  if (category === 'DRAWING') return 'drawings';
  if (category === 'CERAMIC') return slug.toLowerCase().startsWith('scan-') ? 'scans' : 'crafts';
  return null;
}
