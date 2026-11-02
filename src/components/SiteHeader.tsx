import Link from 'next/link';
import { prisma } from '@/lib/db';

export default async function SiteHeader() {
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const title = settings?.siteTitle ?? 'Hei Gallery';
  return (
    <header className="border-b border-ink/10">
      <div className="container-page flex items-center justify-between py-5">
        <Link href="/" className="no-underline">
          <span className="serif text-2xl">{title}</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm tracking-wide">
          <Link href="/collection">Collection</Link>
          <Link href="/museum">3D Museum</Link>
          <Link href="/about">About</Link>
          <Link href="/inquire">Inquire</Link>
        </nav>
      </div>
    </header>
  );
}
