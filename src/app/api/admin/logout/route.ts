import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { audit } from '@/lib/audit';

export async function POST() {
  const session = await getSession();
  const uid = session.userId ?? null;
  session.destroy();
  await audit(uid, 'admin.logout');
  return NextResponse.json({ ok: true });
}

export const dynamic = 'force-dynamic';
