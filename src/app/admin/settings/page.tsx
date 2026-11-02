import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { adminExists, getCsrf, getSession } from '@/lib/auth';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  if (!(await adminExists())) redirect('/admin/setup');
  const session = await getSession();
  if (!session.userId) redirect('/admin/login');
  const s = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const csrf = await getCsrf();
  return (
    <div className="max-w-2xl">
      <h1 className="serif text-3xl">Site settings</h1>
      <div className="card mt-6">
        <SettingsForm
          csrf={csrf}
          initial={{
            siteTitle: s?.siteTitle ?? 'Hei Gallery',
            tagline: s?.tagline ?? '',
            artistName: s?.artistName ?? '',
            artistBio: s?.artistBio ?? '',
            contactEmail: s?.contactEmail ?? '',
            paypalEmail: s?.paypalEmail ?? '',
          }}
        />
      </div>
    </div>
  );
}
