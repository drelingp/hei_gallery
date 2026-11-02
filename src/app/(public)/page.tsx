import Link from 'next/link';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [settings, featured] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { id: 1 } }),
    prisma.artwork.findMany({
      where: { status: 'PUBLISHED' },
      include: { coverImage: true },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
  ]);

  return (
    <>
      <section className="container-page pt-20 pb-16">
        <span className="pill">Online Museum</span>
        <h1 className="serif mt-6 text-5xl leading-tight md:text-7xl">
          {settings?.siteTitle ?? 'Hei Gallery'}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink/70">
          {settings?.tagline ?? 'A young artist\u2019s collection of drawings and ceramics.'}
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/museum" className="btn">Enter the 3D Museum</Link>
          <Link href="/collection" className="btn-ghost">View Collection</Link>
        </div>
      </section>

      <section className="container-page">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="serif text-3xl">Featured works</h2>
          <Link href="/collection" className="text-sm">All works →</Link>
        </div>
        {featured.length === 0 ? (
          <div className="card text-ink/70">
            No works published yet. Once the artist uploads pieces in the admin area, they will appear here.
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((a) => (
              <li key={a.id} className="card">
                <Link href={`/artwork/${a.slug}`} className="no-underline">
                  <div className="aspect-square w-full overflow-hidden rounded bg-ink/5">
                    {a.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/media/${a.coverImage.id}`}
                        alt={a.title}
                        className="h-full w-full object-cover"
                      />
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
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
