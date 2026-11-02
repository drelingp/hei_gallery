export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:6765',
  siteName: process.env.SITE_NAME ?? 'Hei Gallery',
  sessionPassword:
    process.env.SESSION_PASSWORD ??
    'dev-only-insecure-session-password-change-me-please-32+',
  uploadDir: process.env.UPLOAD_DIR ?? './data/uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
  paypalBusinessEmail: process.env.PAYPAL_BUSINESS_EMAIL ?? '',
};

if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  (!process.env.SESSION_PASSWORD || process.env.SESSION_PASSWORD.length < 32)
) {
  throw new Error('SESSION_PASSWORD must be set to a strong value of at least 32 characters in production.');
}
