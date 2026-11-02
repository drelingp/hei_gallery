import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { adminExists, getCsrf, getSession } from '@/lib/auth';
import InquiryRow from './InquiryRow';

export const dynamic = 'force-dynamic';

export default async function InquiriesPage() {
  if (!(await adminExists())) redirect('/admin/setup');
  const session = await getSession();
  if (!session.userId) redirect('/admin/login');

  const items = await prisma.inquiry.findMany({
    include: { artwork: { select: { id: true, title: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const csrf = await getCsrf();

  return (
    <div className="grid gap-6">
      <h1 className="serif text-3xl">Inquiries</h1>
      {items.length === 0 ? (
        <p className="text-ink/70">No inquiries yet.</p>
      ) : (
        <ul className="grid gap-3">
          {items.map((i) => (
            <li key={i.id} className="card">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="serif text-lg">{i.name} <span className="text-sm text-ink/60">&lt;{i.email}&gt;</span></div>
                  <div className="text-xs text-ink/60">
                    {new Date(i.createdAt).toLocaleString()}{' '}
                    {i.artwork && (
                      <>
                        · about{' '}
                        <Link href={`/artwork/${i.artwork.slug}`} className="underline">
                          {i.artwork.title}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <InquiryRow id={i.id} status={i.status as 'NEW' | 'CONTACTED' | 'INVOICE_SENT' | 'SOLD' | 'CLOSED'} csrf={csrf} />
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink/80">{i.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
