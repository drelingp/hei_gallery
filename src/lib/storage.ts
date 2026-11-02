import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MODEL_TYPES = new Set(['model/gltf-binary', 'application/octet-stream']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MODEL_EXT = new Set(['.glb']);

const IMAGE_KEY = /^images\/[a-f0-9]{32}\.(jpg|jpeg|png|webp)$/;
const MODEL_KEY = /^models\/[a-f0-9]{32}\.glb$/;

export type UploadKind = 'IMAGE' | 'MODEL_GLB';

export type StoredFile = {
  storedPath: string; // R2 object key
  filename: string; // original sanitized
  mimeType: string;
  bytes: number;
  body: Buffer;
};

export type UploadMeta = {
  ext: string;
  mimeType: string;
  filename: string;
};

let client: S3Client | undefined;

function r2Config() {
  const { accountId, accessKeyId, secretAccessKey, bucket } = env.r2;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.',
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function r2() {
  const cfg = r2Config();
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      // AWS SDK v3.729+ adds default checksums R2 rejects on presigned PUT.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return client;
}

function maxBytes() {
  return env.maxUploadMb * 1024 * 1024;
}

function safeExt(name: string) {
  const dot = name.lastIndexOf('.');
  const ext = (dot >= 0 ? name.slice(dot) : '').toLowerCase();
  if (!/^\.[a-z0-9]{2,5}$/.test(ext)) return '';
  return ext;
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

export function assertObjectKey(storedPath: string, kind?: UploadKind) {
  const key = storedPath.trim();
  const image = IMAGE_KEY.test(key);
  const model = MODEL_KEY.test(key);
  if (!image && !model) throw new Error('Invalid object key');
  if (kind === 'IMAGE' && !image) throw new Error('Invalid object key');
  if (kind === 'MODEL_GLB' && !model) throw new Error('Invalid object key');
  return key;
}

export function validateUploadMeta(input: {
  kind: UploadKind;
  filename: string;
  mimeType: string;
  bytes: number;
}): UploadMeta {
  if (!Number.isFinite(input.bytes) || input.bytes <= 0) throw new Error('Empty file.');
  if (input.bytes > maxBytes()) throw new Error(`File too large (max ${env.maxUploadMb} MB).`);

  const ext = safeExt(input.filename);
  let mime = (input.mimeType || '').trim().toLowerCase();

  if (input.kind === 'IMAGE') {
    if (!IMAGE_EXT.has(ext) || !IMAGE_TYPES.has(mime)) {
      throw new Error('Only JPEG, PNG, or WebP images are allowed.');
    }
  } else {
    if (!MODEL_EXT.has(ext)) throw new Error('Only .glb 3D models are allowed.');
    if (!mime || mime === 'application/octet-stream') mime = 'model/gltf-binary';
    if (!MODEL_TYPES.has(mime) && mime !== 'model/gltf-binary') {
      throw new Error('Only .glb 3D models are allowed.');
    }
  }

  return {
    ext,
    mimeType: mime,
    filename: sanitizeName(input.filename) || `upload${ext}`,
  };
}

export function allocateObjectKey(kind: UploadKind, ext: string) {
  const id = crypto.randomBytes(16).toString('hex');
  const subdir = kind === 'IMAGE' ? 'images' : 'models';
  return assertObjectKey(`${subdir}/${id}${ext}`, kind);
}

function looksLikeImage(buf: Buffer, mime: string) {
  if (buf.length < 12) return false;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png')
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === 'image/webp')
    return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function looksLikeGlb(buf: Buffer) {
  return buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'glTF';
}

export function mimeTypeForKey(key: string, kind: UploadKind) {
  if (kind === 'MODEL_GLB') return 'model/gltf-binary';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function streamToBuffer(body: unknown, max: number) {
  if (!body) throw new Error('Empty object.');
  if (Buffer.isBuffer(body)) {
    if (body.length > max) throw new Error(`File too large (max ${env.maxUploadMb} MB).`);
    return body;
  }
  if (body instanceof Uint8Array) {
    if (body.byteLength > max) throw new Error(`File too large (max ${env.maxUploadMb} MB).`);
    return Buffer.from(body);
  }
  const stream = body as Readable;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > max) throw new Error(`File too large (max ${env.maxUploadMb} MB).`);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function isMissing(err: unknown) {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

async function putObject(key: string, body: Buffer, mimeType: string) {
  await r2().send(
    new PutObjectCommand({
      Bucket: r2Config().bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
      ContentLength: body.length,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

export async function storeUpload(file: File, kind: UploadKind): Promise<StoredFile> {
  const meta = validateUploadMeta({
    kind,
    filename: file.name,
    mimeType: file.type || (kind === 'MODEL_GLB' ? 'model/gltf-binary' : ''),
    bytes: file.size,
  });
  const body = Buffer.from(await file.arrayBuffer());
  if (body.length <= 0) throw new Error('Empty file.');
  if (body.length > maxBytes()) throw new Error(`File too large (max ${env.maxUploadMb} MB).`);

  if (kind === 'IMAGE') {
    if (!looksLikeImage(body, meta.mimeType)) {
      throw new Error('File contents do not match an allowed image type.');
    }
  } else if (!looksLikeGlb(body)) {
    throw new Error('File contents are not a valid GLB.');
  }

  const storedPath = allocateObjectKey(kind, meta.ext);
  await putObject(storedPath, body, meta.mimeType);
  return {
    storedPath,
    filename: meta.filename,
    mimeType: meta.mimeType,
    bytes: body.length,
    body,
  };
}

export async function presignUpload(key: string, mimeType: string) {
  const safe = assertObjectKey(key);
  const command = new PutObjectCommand({
    Bucket: r2Config().bucket,
    Key: safe,
    ContentType: mimeType,
  });
  const uploadUrl = await getSignedUrl(r2(), command, { expiresIn: 60 * 10 });
  return {
    uploadUrl,
    headers: { 'content-type': mimeType } as Record<string, string>,
  };
}

export async function readStored(storedPath: string) {
  const key = assertObjectKey(storedPath);
  const out = await r2().send(
    new GetObjectCommand({
      Bucket: r2Config().bucket,
      Key: key,
    }),
  );
  return streamToBuffer(out.Body, maxBytes());
}

async function readHeader(key: string) {
  const out = await r2().send(
    new GetObjectCommand({
      Bucket: r2Config().bucket,
      Key: key,
      Range: 'bytes=0-31',
    }),
  );
  // Stop after the GLB/image magic prefix. A server that ignores Range must
  // not force us to buffer the whole object.
  return readPrefix(out.Body, 32);
}

async function readPrefix(body: unknown, max: number) {
  if (!body) throw new Error('Empty object.');
  if (Buffer.isBuffer(body)) return body.subarray(0, max);
  if (body instanceof Uint8Array) return Buffer.from(body.subarray(0, max));
  const stream = body as Readable;
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = max - total;
      chunks.push(buf.subarray(0, remaining));
      total += Math.min(buf.length, remaining);
      if (total >= max) break;
    }
  } finally {
    stream.destroy?.();
  }
  return Buffer.concat(chunks);
}

/**
 * Confirm a presigned upload landed, matches the allowlist, and is within
 * the size cap. Invalid objects are deleted.
 */
export async function inspectUploadedObject(storedPath: string, kind: UploadKind) {
  const key = assertObjectKey(storedPath, kind);
  let head;
  try {
    head = await r2().send(
      new HeadObjectCommand({
        Bucket: r2Config().bucket,
        Key: key,
      }),
    );
  } catch (err) {
    if (isMissing(err)) throw new Error('Upload was not found in storage. Try again.');
    throw err;
  }

  const bytes = head.ContentLength ?? 0;
  if (bytes <= 0) {
    await deleteStored(key);
    throw new Error('Empty file.');
  }
  if (bytes > maxBytes()) {
    await deleteStored(key);
    throw new Error(`File too large (max ${env.maxUploadMb} MB).`);
  }

  if (kind === 'MODEL_GLB') {
    const header = await readHeader(key);
    if (!looksLikeGlb(header)) {
      await deleteStored(key);
      throw new Error('File contents are not a valid GLB.');
    }
    return { bytes, body: undefined as Buffer | undefined };
  }

  const body = await readStored(key);
  if (!looksLikeImage(body, mimeTypeForKey(key, 'IMAGE'))) {
    await deleteStored(key);
    throw new Error('File contents do not match an allowed image type.');
  }
  return { bytes: body.length, body };
}

export function publicObjectUrl(storedPath: string) {
  if (!env.r2.publicUrl) return null;
  let key: string;
  try {
    key = assertObjectKey(storedPath);
  } catch {
    return null;
  }
  return `${env.r2.publicUrl}/${key}`;
}

export async function deleteStored(storedPath: string) {
  try {
    const key = assertObjectKey(storedPath);
    await r2().send(
      new DeleteObjectCommand({
        Bucket: r2Config().bucket,
        Key: key,
      }),
    );
  } catch {
    // Ignore missing files and invalid keys left over from older data.
  }
}
