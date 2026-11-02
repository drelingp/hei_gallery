import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { adminExists, getCsrf, getSession } from '@/lib/auth';
import ArtworkEditor from './ArtworkEditor';

export const dynamic = 'force-dynamic';

export default async function EditArtwork({ params }: { params: Promise<{ id: string }> }) {
  if (!(await adminExists())) redirect('/admin/setup');
  const session = await getSession();
  if (!session.userId) redirect('/admin/login');
  const { id } = await params;
  const item = await prisma.artwork.findUnique({
    where: { id },
    include: { coverImage: true, modelAsset: true },
  });
  if (!item) notFound();
  const csrf = await getCsrf();
  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="serif text-3xl">{item.title}</h1>
        <Link href="/admin/artworks" className="btn-ghost">← All artworks</Link>
      </div>
      <ArtworkEditor
        csrf={csrf}
        artwork={{
          id: item.id,
          title: item.title,
          description: item.description,
          category: item.category as 'DRAWING' | 'CERAMIC',
          status: item.status as 'DRAFT' | 'PUBLISHED',
          available: item.available,
          price: item.price ? Number(item.price) : null,
          currency: item.currency,
          paypalLink: item.paypalLink,
          coverImageId: item.coverImageId,
          modelAssetId: item.modelAssetId,
        }}
      />
    </div>
  );
}
