import { redirect } from 'next/navigation';
import { adminExists, getCsrf, getSession } from '@/lib/auth';
import { loadZoneTexts } from '@/lib/zone-store';
import ZonesForm from './ZonesForm';

export const dynamic = 'force-dynamic';

export default async function ZonesPage() {
  if (!(await adminExists())) redirect('/admin/setup');
  const session = await getSession();
  if (!session.userId) redirect('/admin/login');
  const texts = await loadZoneTexts();
  const csrf = await getCsrf();
  return (
    <div className="max-w-2xl">
      <h1 className="serif text-3xl">Museum zones</h1>
      <p className="mt-2 text-sm text-ink/70">
        Edit the names and wall-sign text shown in each room of the 3D museum.
      </p>
      <div className="card mt-6">
        <ZonesForm csrf={csrf} initial={texts} />
      </div>
    </div>
  );
}
