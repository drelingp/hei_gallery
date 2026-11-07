import Link from 'next/link';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="min-h-screen bg-bone text-ink">
      <header className="border-b border-ink/10 bg-white/60">
        <div className="container-page flex items-center justify-between py-4">
          <Link href="/admin" className="serif text-xl no-underline">
            Hei Gallery · Admin
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin">Dashboard</Link>
            <Link href="/admin/artworks">Artworks</Link>
            <Link href="/admin/inquiries">Inquiries</Link>
            <Link href="/admin/settings">Settings</Link>
            <Link href="/admin/zones">Zones</Link>
            <Link href="/" className="text-ink/60">View site →</Link>
            {session.userId && (
              <form action="/api/admin/logout" method="post">
                <button className="btn-ghost py-1 text-xs" type="submit">Sign out</button>
              </form>
            )}
          </nav>
        </div>
      </header>
      <main className="container-page py-10">{children}</main>
    </div>
  );
}
