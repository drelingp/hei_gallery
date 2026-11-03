'use client';

import { useState } from 'react';
import { useCsrf } from '@/lib/useCsrf';
import { SERVER_UPLOAD_MAX_BYTES } from '@/lib/upload-limits';

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
  const [uploading, setUploading] = useState(false);

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

  function rememberAsset(kind: 'IMAGE' | 'MODEL_GLB', assetId: string) {
    if (kind === 'IMAGE') setA((prev) => ({ ...prev, coverImageId: assetId }));
    else setA((prev) => ({ ...prev, modelAssetId: assetId }));
    setMsg('Uploaded.');
  }

  async function upload(file: File, kind: 'IMAGE' | 'MODEL_GLB') {
    const token = await ensureCsrf();
    if (!token) {
      setMsg('Could not prepare the secure form token. Please refresh and try again.');
      return;
    }
    setUploading(true);
    setMsg(kind === 'MODEL_GLB' ? 'Uploading 3D model…' : 'Uploading image…');
    try {
      if (file.size > SERVER_UPLOAD_MAX_BYTES) {
        await uploadPresigned(file, kind, token);
      } else {
        await uploadMultipart(file, kind, token);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function uploadMultipart(file: File, kind: 'IMAGE' | 'MODEL_GLB', token: string) {
    const form = new FormData();
    form.set('csrf', token);
    form.set('kind', kind);
    form.set('file', file);
    const r = await fetch(`/api/admin/artworks/${a.id}/media`, { method: 'POST', body: form });
    const j = (await r.json().catch(() => ({ error: 'Upload failed.' }))) as {
      error?: string;
      asset?: { id: string };
    };
    if (!r.ok || !j.asset) throw new Error(j.error ?? 'Upload failed.');
    rememberAsset(kind, j.asset.id);
  }

  async function uploadPresigned(file: File, kind: 'IMAGE' | 'MODEL_GLB', token: string) {
    const mimeType = file.type || (kind === 'MODEL_GLB' ? 'model/gltf-binary' : '');
    const presign = await fetch(`/api/admin/artworks/${a.id}/media`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'presign',
        csrf: token,
        kind,
        filename: file.name,
        mimeType,
        bytes: file.size,
      }),
    });
    const signed = (await presign.json().catch(() => ({ error: 'Could not start upload.' }))) as {
      error?: string;
      uploadUrl?: string;
      headers?: Record<string, string>;
      key?: string;
    };
    if (!presign.ok || !signed.uploadUrl || !signed.key) {
      throw new Error(signed.error ?? 'Could not start upload.');
    }

    const put = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: signed.headers,
      body: file,
    });
    if (!put.ok) {
      throw new Error(
        `Upload to storage failed (${put.status}). Check that the R2 bucket CORS policy allows PUT from this site.`,
      );
    }

    const done = await fetch(`/api/admin/artworks/${a.id}/media`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'complete',
        csrf: token,
        kind,
        filename: file.name,
        mimeType,
        key: signed.key,
      }),
    });
    const j = (await done.json().catch(() => ({ error: 'Upload failed.' }))) as {
      error?: string;
      asset?: { id: string };
    };
    if (!done.ok || !j.asset) throw new Error(j.error ?? 'Upload failed.');
    rememberAsset(kind, j.asset.id);
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
          <button className="btn" type="submit" disabled={csrfLoading || uploading}>Save</button>
          <button type="button" className="btn-ghost text-red-700" onClick={del} disabled={csrfLoading || uploading}>Delete</button>
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
            disabled={uploading}
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
            <label className="label mt-4">Upload a .glb file (≤ env MAX_UPLOAD_MB). Larger models upload directly to storage.</label>
            <input
              aria-label="Upload 3D model"
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={(e) => e.target.files && upload(e.target.files[0], 'MODEL_GLB')}
              disabled={uploading}
            />
          </div>
        )}
      </div>
    </div>
  );
}
