'use client';

import dynamic from 'next/dynamic';
import type { Drawing, Craft, Scan } from '@/components/gallery3d/Museum3D';

const Museum3D = dynamic(() => import('@/components/gallery3d/Museum3D'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-bone/80">
      Loading museum…
    </div>
  ),
});

export default function Museum3DClient(props: {
  drawings: Drawing[];
  crafts: Craft[];
  scans: Scan[];
}) {
  return <Museum3D {...props} />;
}
