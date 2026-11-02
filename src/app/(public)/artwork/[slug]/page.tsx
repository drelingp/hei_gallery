import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ArtworkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await prisma.artwork.findUnique({
    where: { slug },
    include: { coverImage: true, modelAsset: true },
  });
  if (!a || a.status !== 'PUBLISHED') notFound();

  return (
    <article className="container-page grid gap-12 py-16 md:grid-cols-2">
      <div className="aspect-square w-full overflow-hidden rounded bg-ink/5">
        {a.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${a.coverImage.id}`} alt={a.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink/30">No image</div>
        )}
      </div>
      <div>
        <span className="pill">{a.category === 'CERAMIC' ? 'Ceramic' : 'Drawing'}</span>
        <h1 className="serif mt-4 text-4xl">{a.title}</h1>
        {a.price !== null ? (
          <div className="mt-3 text-lg text-ink/80">
            {a.currency} {Number(a.price).toFixed(2)} {!a.available && <span className="ml-2 pill">Sold</span>}
          </div>
        ) : (
          <div className="mt-3 text-lg text-ink/60">Price on request</div>
        )}
        <p className="mt-6 whitespace-pre-wrap text-ink/80">{a.description || 'No description.'}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/inquire?artwork=${a.id}`} className="btn">
            {a.available ? 'Inquire to purchase' : 'Ask about similar work'}
          </Link>
          {a.available && a.paypalLink && (
            <a href={a.paypalLink} className="btn-ghost" target="_blank" rel="noopener noreferrer">
              Pay with PayPal
            </a>
          )}
          <Link href="/museum" className="btn-ghost">See in 3D museum</Link>
        </div>
      </div>
    </article>
  );
}
