import { prisma } from '@/lib/db';
import InquireForm from './InquireForm';
import { getCsrf } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function InquirePage({
  searchParams,
}: {
  searchParams: Promise<{ artwork?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const artwork = sp.artwork
    ? await prisma.artwork.findUnique({ where: { id: sp.artwork } })
    : null;
  const csrf = await getCsrf();

  return (
    <section className="container-page py-16">
      <h1 className="serif text-4xl">Inquire</h1>
      <p className="mt-3 max-w-2xl text-ink/70">
        Send a message about a piece, a commission, or any question. The artist will reply by email.
      </p>
      {sp.ok && (
        <div className="card mt-6 max-w-2xl border-gold/40 bg-gold/10">
          Thank you. Your inquiry has been received.
        </div>
      )}
      <div className="mt-8 max-w-2xl">
        <InquireForm
          csrf={csrf}
          artwork={
            artwork
              ? { id: artwork.id, title: artwork.title }
              : null
          }
        />
      </div>
    </section>
  );
}
