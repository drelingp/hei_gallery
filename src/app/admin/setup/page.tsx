import { redirect } from 'next/navigation';
import { adminExists } from '@/lib/auth';
import SetupForm from './SetupForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (await adminExists()) redirect('/admin/login');
  return (
    <div className="mx-auto max-w-md">
      <h1 className="serif text-3xl">First-time setup</h1>
      <p className="mt-2 text-ink/70">
        Create the single admin account for this gallery. Use a long, unique password. You can change it later from
        the admin area.
      </p>
      <div className="card mt-6">
        <SetupForm />
      </div>
    </div>
  );
}
