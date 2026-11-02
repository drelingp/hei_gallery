import { redirect } from 'next/navigation';
import { adminExists } from '@/lib/auth';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (!(await adminExists())) redirect('/admin/setup');
  return (
    <div className="mx-auto max-w-md">
      <h1 className="serif text-3xl">Admin sign in</h1>
      <div className="card mt-6">
        <LoginForm />
      </div>
    </div>
  );
}
