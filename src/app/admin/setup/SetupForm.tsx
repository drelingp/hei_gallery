'use client';

import { useState } from 'react';

export default function SetupForm() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const r = await fetch('/api/admin/setup', { method: 'POST', body: new FormData(e.currentTarget) });
    if (r.ok) window.location.href = '/admin';
    else {
      const j = await r.json().catch(() => ({ error: 'Setup failed.' }));
      setErr(j.error ?? 'Setup failed.');
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div>
        <label className="label">Your name</label>
        <input name="name" aria-label="Your name" required className="input" />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" aria-label="Email" type="email" required className="input" />
      </div>
      <div>
        <label className="label">Password (min 10 chars)</label>
        <input name="password" aria-label="Password" type="password" minLength={10} required className="input" />
      </div>
      {err && <div className="text-sm text-red-700">{err}</div>}
      <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create admin'}</button>
    </form>
  );
}
