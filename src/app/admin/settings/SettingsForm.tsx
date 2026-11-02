'use client';

import { useState } from 'react';
import { useCsrf } from '@/lib/useCsrf';

type S = {
  siteTitle: string;
  tagline: string;
  artistName: string;
  artistBio: string;
  contactEmail: string;
  paypalEmail: string;
};

export default function SettingsForm({ csrf, initial }: { csrf: string | null; initial: S }) {
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
    const r = await fetch('/api/admin/settings', { method: 'PUT', body: form });
    setMsg(r.ok ? 'Saved.' : 'Could not save.');
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div>
        <label className="label">Site title</label>
        <input name="siteTitle" aria-label="Site title" defaultValue={initial.siteTitle} required className="input" />
      </div>
      <div>
        <label className="label">Tagline</label>
        <input name="tagline" aria-label="Tagline" defaultValue={initial.tagline} className="input" />
      </div>
      <div>
        <label className="label">Artist name</label>
        <input name="artistName" aria-label="Artist name" defaultValue={initial.artistName} required className="input" />
      </div>
      <div>
        <label className="label">Artist biography</label>
        <textarea name="artistBio" aria-label="Artist biography" rows={8} defaultValue={initial.artistBio} className="input" />
      </div>
      <div>
        <label className="label">Contact email</label>
        <input name="contactEmail" aria-label="Contact email" type="email" defaultValue={initial.contactEmail} className="input" />
      </div>
      <div>
        <label className="label">Default PayPal email (optional)</label>
        <input name="paypalEmail" aria-label="Default PayPal email" type="email" defaultValue={initial.paypalEmail} className="input" />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={csrfLoading}>Save</button>
        {(msg || csrfError) && <span className="text-sm text-ink/70">{msg ?? csrfError}</span>}
      </div>
    </form>
  );
}
