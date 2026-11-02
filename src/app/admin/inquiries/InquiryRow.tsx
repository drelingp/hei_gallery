'use client';

import { useState } from 'react';
import { useCsrf } from '@/lib/useCsrf';

const STATUSES = ['NEW', 'CONTACTED', 'INVOICE_SENT', 'SOLD', 'CLOSED'] as const;
type Status = (typeof STATUSES)[number];

export default function InquiryRow({
  id,
  status,
  csrf,
}: {
  id: string;
  status: Status;
  csrf: string | null;
}) {
  const { csrfLoading, ensureCsrf } = useCsrf(csrf);
  const [s, setS] = useState<Status>(status);
  const [busy, setBusy] = useState(false);
  async function change(next: Status) {
    setBusy(true);
    const token = await ensureCsrf();
    if (!token) {
      setBusy(false);
      return;
    }
    const form = new FormData();
    form.set('csrf', token);
    form.set('id', id);
    form.set('status', next);
    const r = await fetch('/api/admin/inquiries', { method: 'PATCH', body: form });
    if (r.ok) setS(next);
    setBusy(false);
  }
  return (
    <select
      className="input max-w-[12rem]"
      aria-label="Inquiry status"
      value={s}
      disabled={busy || csrfLoading}
      onChange={(e) => change(e.target.value as Status)}
    >
      {STATUSES.map((x) => (
        <option key={x} value={x}>
          {x.replace('_', ' ')}
        </option>
      ))}
    </select>
  );
}
