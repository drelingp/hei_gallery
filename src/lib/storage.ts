import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from './env';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MODEL_TYPES = new Set(['model/gltf-binary', 'application/octet-stream']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MODEL_EXT = new Set(['.glb']);

export type StoredFile = {
  storedPath: string; // relative path inside UPLOAD_DIR
  filename: string; // original sanitized
  mimeType: string;
  bytes: number;
};

function safeExt(name: string) {
  const ext = path.extname(name).toLowerCase();
  // Only allow simple extensions.
  if (!/^\.[a-z0-9]{2,5}$/.test(ext)) return '';
  return ext;
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

export async function ensureUploadDir() {
  await fs.mkdir(env.uploadDir, { recursive: true });
}

export async function storeUpload(
  file: File,
  kind: 'IMAGE' | 'MODEL_GLB',
): Promise<StoredFile> {
  const max = env.maxUploadMb * 1024 * 1024;
  if (file.size <= 0) throw new Error('Empty file.');
  if (file.size > max) throw new Error(`File too large (max ${env.maxUploadMb} MB).`);

  const ext = safeExt(file.name);
  const mime = file.type || 'application/octet-stream';

  if (kind === 'IMAGE') {
    if (!IMAGE_TYPES.has(mime) || !IMAGE_EXT.has(ext)) {
      throw new Error('Only JPEG, PNG, or WebP images are allowed.');
    }
  } else {
    if (!MODEL_EXT.has(ext) || !MODEL_TYPES.has(mime)) {
      throw new Error('Only .glb 3D models are allowed.');
    }
  }

  await ensureUploadDir();

  const id = crypto.randomBytes(16).toString('hex');
  const subdir = kind === 'IMAGE' ? 'images' : 'models';
  const dir = path.join(env.uploadDir, subdir);
  await fs.mkdir(dir, { recursive: true });
  const storedName = `${id}${ext}`;
  const fullPath = path.join(dir, storedName);

  const buf = Buffer.from(await file.arrayBuffer());

  // Basic magic-byte sanity check for images and GLB.
  if (kind === 'IMAGE') {
    if (!looksLikeImage(buf, mime)) throw new Error('File contents do not match an allowed image type.');
  } else {
    if (!looksLikeGlb(buf)) throw new Error('File contents are not a valid GLB.');
  }

  await fs.writeFile(fullPath, buf, { mode: 0o640 });

  return {
    storedPath: path.posix.join(subdir, storedName),
    filename: sanitizeName(file.name) || storedName,
    mimeType: mime,
    bytes: buf.length,
  };
}

function looksLikeImage(buf: Buffer, mime: string) {
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png')
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === 'image/webp')
    return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function looksLikeGlb(buf: Buffer) {
  return buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'glTF';
}

export function resolveStoredPath(storedPath: string) {
  // Prevent path traversal: only allow a single safe relative path.
  const normalized = path.posix.normalize(storedPath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error('Invalid path');
  }
  return path.join(env.uploadDir, normalized);
}

export async function readStored(storedPath: string) {
  const full = resolveStoredPath(storedPath);
  return fs.readFile(full);
}

export async function deleteStored(storedPath: string) {
  try {
    const full = resolveStoredPath(storedPath);
    await fs.unlink(full);
  } catch {
    // Ignore missing files.
  }
}
