'use client';

import { useState } from 'react';

export default function LoginForm() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const r = await fetch('/api/admin/login', { method: 'POST', body: new FormData(e.currentTarget) });
    if (r.ok) {
      const next = new URLSearchParams(window.location.search).get('next') || '/admin';
      window.location.href = next;
    } else {
      const j = await r.json().catch(() => ({ error: 'Sign in failed.' }));
      setErr(j.error ?? 'Sign in failed.');
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div>
        <label className="label">Email</label>
        <input name="email" aria-label="Email" type="email" required className="input" autoFocus />
      </div>
      <div>
        <label className="label">Password</label>
        <input name="password" aria-label="Password" type="password" required className="input" />
      </div>
      {err && <div className="text-sm text-red-700">{err}</div>}
      <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
