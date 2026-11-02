import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function About() {
  const s = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  return (
    <section className="container-page py-16">
      <span className="pill">About the artist</span>
      <h1 className="serif mt-4 text-5xl">{s?.artistName ?? 'The Artist'}</h1>
      <div className="mt-8 max-w-3xl whitespace-pre-wrap text-lg leading-relaxed text-ink/80">
        {s?.artistBio || 'A short biography will appear here once the artist updates it from the admin area.'}
      </div>
      {s?.contactEmail && (
        <p className="mt-8 text-sm text-ink/70">
          Contact:{' '}
          <a href={`mailto:${s.contactEmail}`} className="underline">
            {s.contactEmail}
          </a>
        </p>
      )}
    </section>
  );
}
