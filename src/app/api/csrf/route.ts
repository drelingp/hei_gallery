import { NextResponse } from 'next/server';
import { getOrCreateCsrf } from '@/lib/auth';

export async function GET() {
  const csrf = await getOrCreateCsrf();
  return NextResponse.json(
    { csrf },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
