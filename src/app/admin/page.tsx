import { redirect } from 'next/navigation';
import Link from 'next/link';
import { adminExists, getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  if (!(await adminExists())) redirect('/admin/setup');
  const session = await getSession();
  if (!session.userId) redirect('/admin/login');

  const [artworks, inquiries, published] = await Promise.all([
    prisma.artwork.count(),
    prisma.inquiry.count({ where: { status: 'NEW' } }),
    prisma.artwork.count({ where: { status: 'PUBLISHED' } }),
  ]);

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Stat label="Artworks" value={artworks} href="/admin/artworks" />
      <Stat label="Published" value={published} href="/admin/artworks" />
      <Stat label="New inquiries" value={inquiries} href="/admin/inquiries" />
      <div className="card md:col-span-3">
        <h2 className="serif text-2xl">Welcome, {session.email}</h2>
        <p className="mt-2 text-ink/70">
          Use the admin area to add drawings and ceramics, upload images and 3D models, manage inquiries,
          and edit the artist introduction. The public site updates automatically once a piece is set to
          published.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="card no-underline">
      <div className="text-xs uppercase tracking-widest text-ink/60">{label}</div>
      <div className="serif mt-2 text-4xl">{value}</div>
    </Link>
  );
}
