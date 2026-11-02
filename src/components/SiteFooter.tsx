import Link from 'next/link';
import { prisma } from '@/lib/db';

export default async function SiteFooter() {
  const s = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  return (
    <footer className="mt-24 border-t border-ink/10">
      <div className="container-page flex flex-col items-start justify-between gap-4 py-8 text-sm text-ink/70 md:flex-row md:items-center">
        <div>
          © {new Date().getFullYear()} {s?.artistName ?? 'Hei'}. All works property of the artist.
        </div>
        <div className="flex gap-6">
          <Link href="/about">About</Link>
          <Link href="/inquire">Inquire</Link>
          <Link href="/admin">Admin</Link>
        </div>
      </div>
    </footer>
  );
}
