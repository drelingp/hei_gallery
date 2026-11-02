import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { adminExists, getCsrf, getSession } from '@/lib/auth';
import ArtworkCreator from './ArtworkCreator';

export const dynamic = 'force-dynamic';

export default async function AdminArtworks() {
  if (!(await adminExists())) redirect('/admin/setup');
  const session = await getSession();
  if (!session.userId) redirect('/admin/login');

  const items = await prisma.artwork.findMany({
    include: { coverImage: true, modelAsset: true },
    orderBy: { updatedAt: 'desc' },
  });
  const csrf = await getCsrf();

  return (
    <div className="grid gap-8">
      <section>
        <h1 className="serif text-3xl">Artworks</h1>
        <p className="mt-2 text-sm text-ink/70">
          Add drawings and ceramics. Upload a cover image for every piece. For ceramics you can also upload a
          GLB 3D model that visitors will see on a pedestal in the 3D museum.
        </p>
      </section>

      <section className="card">
        <h2 className="serif text-xl">Add a new work</h2>
        <div className="mt-4">
          <ArtworkCreator csrf={csrf} />
        </div>
      </section>

      <section>
        <h2 className="serif text-xl">All works ({items.length})</h2>
        <ul className="mt-4 grid gap-4">
          {items.length === 0 && <li className="card text-ink/70">No works yet.</li>}
          {items.map((a) => (
            <li key={a.id} className="card flex items-start gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded bg-ink/5">
                {a.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/media/${a.coverImage.id}`} alt={a.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-ink/40">no img</div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/admin/artworks/${a.id}`} className="serif text-lg no-underline">
                    {a.title}
                  </Link>
                  <span className="text-xs uppercase tracking-widest text-ink/60">
                    {a.category} · {a.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-ink/60">
                  {a.modelAsset ? '3D model attached' : a.category === 'CERAMIC' ? 'No 3D model yet' : ''}
                  {a.price !== null && ` · ${a.currency} ${Number(a.price).toFixed(2)}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
