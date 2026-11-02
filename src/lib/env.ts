export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:6765',
  siteName: process.env.SITE_NAME ?? 'Hei Gallery',
  sessionPassword:
    process.env.SESSION_PASSWORD ??
    'dev-only-insecure-session-password-change-me-please-32+',
  maxUploadMb: positiveInt(process.env.MAX_UPLOAD_MB, 25),
  paypalBusinessEmail: process.env.PAYPAL_BUSINESS_EMAIL ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucket: process.env.R2_BUCKET ?? '',
    publicUrl: (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, ''),
  },
};

function positiveInt(raw: string | undefined, fallback: number) {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  (!process.env.SESSION_PASSWORD || process.env.SESSION_PASSWORD.length < 32)
) {
  throw new Error('SESSION_PASSWORD must be set to a strong value of at least 32 characters in production.');
}

if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  !process.env.NEXT_PUBLIC_SITE_URL
) {
  throw new Error('NEXT_PUBLIC_SITE_URL must be set in production.');
}
