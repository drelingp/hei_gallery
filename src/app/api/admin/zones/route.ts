import { NextResponse } from 'next/server';
import { getSession, assertCsrf } from '@/lib/auth';
import { zonesSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { ZONE_KEYS } from '@/lib/zones';
import { saveZoneTexts } from '@/lib/zone-store';

export async function PUT(req: Request) {
  const s = await getSession();
  if (!s.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const form = await req.formData();
  await assertCsrf(String(form.get('csrf') ?? ''));

  const raw = Object.fromEntries(
    ZONE_KEYS.map((key) => [
      key,
      {
        name: String(form.get(`${key}.name`) ?? ''),
        signTitle: String(form.get(`${key}.signTitle`) ?? ''),
        signSubtitle: String(form.get(`${key}.signSubtitle`) ?? ''),
      },
    ]),
  );
  const parsed = zonesSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  await saveZoneTexts(parsed.data);
  await audit(s.userId, 'zones.update');
  return NextResponse.json({ ok: true });
}
