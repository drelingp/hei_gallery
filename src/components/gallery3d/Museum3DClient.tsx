'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
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
  useEffect(() => {
    const savedStyles = [document.documentElement, document.body].map((element) => {
      const properties = [
        ['overflow-x', 'hidden'],
        ['overflow-y', 'hidden'],
        ['overscroll-behavior-x', 'none'],
        ['overscroll-behavior-y', 'none'],
      ] as const;
      const previous = properties.map(([property, value]) => {
        const saved = {
          property,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        };
        element.style.setProperty(property, value);
        return saved;
      });
      return { element, previous };
    });

    return () => {
      for (const { element, previous } of savedStyles) {
        for (const { property, value, priority } of previous) {
          if (value) {
            element.style.setProperty(property, value, priority);
          } else {
            element.style.removeProperty(property);
          }
        }
      }
    };
  }, []);

  return <Museum3D {...props} />;
}
