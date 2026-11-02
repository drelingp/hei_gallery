'use client';

import { useState } from 'react';
import { useCsrf } from '@/lib/useCsrf';

const CREATE_TIMEOUT_MS = 15_000;

export default function ArtworkCreator({ csrf }: { csrf: string | null }) {
  const { csrfLoading, csrfError, ensureCsrf } = useCsrf(csrf);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setErr(null);
    setBusy(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CREATE_TIMEOUT_MS);

    try {
      const token = await ensureCsrf();
      if (!token) {
        setErr('Could not prepare the secure form token. Please refresh and try again.');
        return;
      }

      const form = new FormData(formEl);
      form.set('csrf', token);

      const r = await fetch('/api/admin/artworks', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      const j = (await r.json().catch(() => null)) as { error?: string; item?: { id?: string } } | null;

      if (!r.ok) {
        setErr(j?.error ?? 'Could not create artwork.');
        return;
      }

      if (!j?.item?.id) {
        setErr('Artwork was created, but the server response was incomplete. Please refresh the page.');
        return;
      }

      window.location.href = `/admin/artworks/${j.item.id}`;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setErr('Saving timed out. Please try again.');
      } else {
        setErr(error instanceof Error ? error.message : 'Could not create artwork.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="label">Title</label>
        <input name="title" aria-label="Title" required maxLength={120} className="input" />
      </div>
      <div>
        <label className="label">Category</label>
        <select name="category" aria-label="Category" className="input" defaultValue="DRAWING">
          <option value="DRAWING">Drawing</option>
          <option value="CERAMIC">Ceramic</option>
        </select>
      </div>
      <div>
        <label className="label">Status</label>
        <select name="status" aria-label="Status" className="input" defaultValue="DRAFT">
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="label">Description</label>
        <textarea name="description" aria-label="Description" rows={4} maxLength={4000} className="input" />
      </div>
      <div>
        <label className="label">Price (optional)</label>
        <input name="price" aria-label="Price" type="number" step="0.01" min="0" className="input" />
      </div>
      <div>
        <label className="label">Currency</label>
        <input name="currency" aria-label="Currency" defaultValue="USD" maxLength={3} className="input" />
      </div>
      <div className="md:col-span-2">
        <label className="label">PayPal link (optional)</label>
        <input name="paypalLink" type="url" placeholder="https://paypal.me/…" className="input" />
      </div>
      {(err || csrfError) && <div className="md:col-span-2 text-sm text-red-700">{err ?? csrfError}</div>}
      <div className="md:col-span-2">
        <button className="btn" disabled={busy || csrfLoading}>{busy ? 'Saving…' : 'Create artwork'}</button>
      </div>
    </form>
  );
}
