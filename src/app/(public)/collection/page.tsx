import Link from 'next/link';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Collection({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const sp = await searchParams;
  const category =
    sp.category === 'CERAMIC' ? 'CERAMIC' : sp.category === 'DRAWING' ? 'DRAWING' : undefined;
  const works = await prisma.artwork.findMany({
    where: { status: 'PUBLISHED', ...(category ? { category } : {}) },
    include: { coverImage: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <section className="container-page py-16">
      <div className="flex items-end justify-between">
        <h1 className="serif text-4xl">Collection</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/collection" className={!category ? 'pill' : ''}>All</Link>
          <Link href="/collection?category=DRAWING" className={category === 'DRAWING' ? 'pill' : ''}>
            Drawings
          </Link>
          <Link href="/collection?category=CERAMIC" className={category === 'CERAMIC' ? 'pill' : ''}>
            Ceramics
          </Link>
        </div>
      </div>
      {works.length === 0 ? (
        <p className="mt-10 text-ink/70">No works to display yet.</p>
      ) : (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((a) => (
            <li key={a.id} className="card">
              <Link href={`/artwork/${a.slug}`} className="no-underline">
                <div className="aspect-square w-full overflow-hidden rounded bg-ink/5">
                  {a.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/media/${a.coverImage.id}`} alt={a.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink/30">No image</div>
                  )}
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <span className="serif text-xl">{a.title}</span>
                  <span className="text-xs uppercase tracking-widest text-ink/60">
                    {a.category === 'CERAMIC' ? 'Ceramic' : 'Drawing'}
                  </span>
                </div>
                {a.price !== null && (
                  <div className="mt-1 text-sm text-ink/70">
                    {a.currency} {Number(a.price).toFixed(2)}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
