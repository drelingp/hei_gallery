'use client';

import { useState } from 'react';
import { useCsrf } from '@/lib/useCsrf';
import { ZONE_KEYS, ZONE_LABELS, type ZoneTexts } from '@/lib/zones';

export default function ZonesForm({ csrf, initial }: { csrf: string | null; initial: ZoneTexts }) {
  const { csrfLoading, csrfError, ensureCsrf } = useCsrf(csrf);
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setMsg(null);
    const token = await ensureCsrf();
    if (!token) {
      setMsg('Could not prepare the secure form token. Please refresh and try again.');
      return;
    }
    const form = new FormData(formEl);
    form.set('csrf', token);
    const r = await fetch('/api/admin/zones', { method: 'PUT', body: form });
    setMsg(r.ok ? 'Saved.' : 'Could not save.');
  }
  return (
    <form onSubmit={submit} className="grid gap-6">
      {ZONE_KEYS.map((key) => (
        <fieldset key={key} className="grid gap-4 border-b border-ink/10 pb-6 last:border-0 last:pb-0">
          <legend className="font-medium">{ZONE_LABELS[key]}</legend>
          <div>
            <label className="label">Map and direction-sign name</label>
            <input
              name={`${key}.name`}
              aria-label={`${ZONE_LABELS[key]} name`}
              defaultValue={initial[key].name}
              required
              maxLength={80}
              className="input"
            />
          </div>
          <div>
            <label className="label">Wall sign title</label>
            <input
              name={`${key}.signTitle`}
              aria-label={`${ZONE_LABELS[key]} wall sign title`}
              defaultValue={initial[key].signTitle}
              required
              maxLength={80}
              className="input"
            />
          </div>
          <div>
            <label className="label">Wall sign subtitle (optional)</label>
            <input
              name={`${key}.signSubtitle`}
              aria-label={`${ZONE_LABELS[key]} wall sign subtitle`}
              defaultValue={initial[key].signSubtitle}
              maxLength={80}
              className="input"
            />
            <p className="mt-1 text-xs text-ink/60">Leave empty to show only the title.</p>
          </div>
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={csrfLoading}>Save</button>
        {(msg || csrfError) && <span className="text-sm text-ink/70">{msg ?? csrfError}</span>}
      </div>
    </form>
  );
}
