'use client';

import { useState } from 'react';
import { useCsrf } from '@/lib/useCsrf';

type A = {
  id: string;
  title: string;
  description: string;
  category: 'DRAWING' | 'CERAMIC';
  status: 'DRAFT' | 'PUBLISHED';
  available: boolean;
  price: number | null;
  currency: string;
  paypalLink: string | null;
  coverImageId: string | null;
  modelAssetId: string | null;
};

export default function ArtworkEditor({ csrf, artwork }: { csrf: string | null; artwork: A }) {
  const { csrfLoading, csrfError, ensureCsrf } = useCsrf(csrf);
  const [a, setA] = useState(artwork);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
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
    const r = await fetch(`/api/admin/artworks/${a.id}`, { method: 'PATCH', body: form });
    setMsg(r.ok ? 'Saved.' : 'Could not save.');
    if (r.ok) {
      const j = await r.json();
      setA({ ...a, ...j.item, price: j.item.price ? Number(j.item.price) : null });
    }
  }

  async function upload(file: File, kind: 'IMAGE' | 'MODEL_GLB') {
    const token = await ensureCsrf();
    if (!token) {
      setMsg('Could not prepare the secure form token. Please refresh and try again.');
      return;
    }
    const form = new FormData();
    form.set('csrf', token);
    form.set('kind', kind);
    form.set('file', file);
    const r = await fetch(`/api/admin/artworks/${a.id}/media`, { method: 'POST', body: form });
    if (r.ok) {
      const j = await r.json();
      if (kind === 'IMAGE') setA({ ...a, coverImageId: j.asset.id });
      else setA({ ...a, modelAssetId: j.asset.id });
      setMsg('Uploaded.');
    } else {
      const j = await r.json().catch(() => ({ error: 'Upload failed.' }));
      setMsg(j.error ?? 'Upload failed.');
    }
  }

  async function del() {
    if (!confirm('Delete this artwork and its media?')) return;
    const token = await ensureCsrf();
    if (!token) {
      setMsg('Could not prepare the secure form token. Please refresh and try again.');
      return;
    }
    const r = await fetch(`/api/admin/artworks/${a.id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': token },
    });
    if (r.ok) window.location.href = '/admin/artworks';
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={save} className="card grid gap-4">
        <div>
          <label className="label">Title</label>
          <input name="title" aria-label="Title" defaultValue={a.title} required className="input" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Category</label>
            <select name="category" aria-label="Category" defaultValue={a.category} className="input">
              <option value="DRAWING">Drawing</option>
              <option value="CERAMIC">Ceramic</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" aria-label="Status" defaultValue={a.status} className="input">
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </div>
          <div>
            <label className="label">Available</label>
            <select name="available" aria-label="Available" defaultValue={a.available ? 'true' : 'false'} className="input">
              <option value="true">Yes</option>
              <option value="false">No / Sold</option>
            </select>
          </div>
          <div>
            <label className="label">Currency</label>
            <input name="currency" aria-label="Currency" defaultValue={a.currency} maxLength={3} className="input" />
          </div>
          <div>
            <label className="label">Price (optional)</label>
            <input name="price" aria-label="Price" type="number" step="0.01" min="0" defaultValue={a.price ?? ''} className="input" />
          </div>
          <div>
            <label className="label">PayPal link (optional)</label>
            <input name="paypalLink" aria-label="PayPal link" type="url" defaultValue={a.paypalLink ?? ''} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea name="description" aria-label="Description" rows={6} defaultValue={a.description} className="input" />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" type="submit" disabled={csrfLoading}>Save</button>
          <button type="button" className="btn-ghost text-red-700" onClick={del} disabled={csrfLoading}>Delete</button>
          {(msg || csrfError) && <span className="text-sm text-ink/70">{msg ?? csrfError}</span>}
        </div>
      </form>

      <div className="grid gap-4">
        <div className="card">
          <h3 className="serif text-lg">Cover image</h3>
          {a.coverImageId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/media/${a.coverImageId}`} alt="" className="mt-3 max-h-56 rounded object-cover" />
          ) : (
            <p className="mt-2 text-sm text-ink/60">No image uploaded.</p>
          )}
          <label className="label mt-4">Upload JPG, PNG, or WebP</label>
          <input
            aria-label="Upload cover image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => e.target.files && upload(e.target.files[0], 'IMAGE')}
          />
        </div>
        {a.category === 'CERAMIC' && (
          <div className="card">
            <h3 className="serif text-lg">3D model (GLB)</h3>
            {a.modelAssetId ? (
              <p className="mt-2 text-sm text-ink/70">Model attached.</p>
            ) : (
              <p className="mt-2 text-sm text-ink/60">No 3D model yet. Visitors will see the photo on a pedestal.</p>
            )}
            <label className="label mt-4">Upload a .glb file (≤ env MAX_UPLOAD_MB)</label>
            <input
              aria-label="Upload 3D model"
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={(e) => e.target.files && upload(e.target.files[0], 'MODEL_GLB')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
