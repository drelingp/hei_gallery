'use client';

import { useState } from 'react';
import { useCsrf } from '@/lib/useCsrf';

export default function InquireForm({
  csrf,
  artwork,
}: {
  csrf: string | null;
  artwork: { id: string; title: string } | null;
}) {
  const { csrf: activeCsrf, csrfLoading, csrfError, ensureCsrf } = useCsrf(csrf);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setSubmitting(true);
    setError(null);
    const token = await ensureCsrf();
    if (!token) {
      setError('Could not prepare the secure form token. Please refresh and try again.');
      setSubmitting(false);
      return;
    }
    const form = new FormData(formEl);
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      body: form,
      headers: { 'x-csrf-token': token },
    });
    if (res.ok) {
      window.location.href = '/inquire?ok=1';
    } else {
      const t = await res.text().catch(() => 'Could not send.');
      setError(t || 'Could not send.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="csrf" value={activeCsrf} />
      {artwork && <input type="hidden" name="artworkId" value={artwork.id} />}
      {artwork && (
        <div className="card text-sm">
          Inquiring about: <strong>{artwork.title}</strong>
        </div>
      )}
      <div>
        <label className="label">Your name</label>
        <input name="name" aria-label="Your name" required maxLength={120} className="input" />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" aria-label="Email" type="email" required maxLength={200} className="input" />
      </div>
      <div>
        <label className="label">Message</label>
        <textarea name="message" aria-label="Message" required minLength={5} maxLength={4000} rows={6} className="input" />
      </div>
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
      {(error || csrfError) && <div className="text-sm text-red-700">{error ?? csrfError}</div>}
      <div>
        <button className="btn" disabled={submitting || csrfLoading}>
          {submitting ? 'Sending…' : 'Send inquiry'}
        </button>
      </div>
    </form>
  );
}
