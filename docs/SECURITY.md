# Security overview

This document summarizes how Hei Gallery protects the site, the admin, and the
artworks. Read it once before going online, and re-read after any major change.

## Secrets

- `SESSION_PASSWORD` must be at least 32 characters. Use
  `openssl rand -base64 48` to generate one. The app refuses to start in
  production if this is missing or short.
- Database credentials and any future API keys live only in `.env` (loaded by
  Docker Compose) or in your deployment platform's secret manager. Never commit
  `.env`.
- Rotate `SESSION_PASSWORD` if you ever suspect it was exposed; doing so logs
  out all admin sessions.

## Authentication

- The site begins with no admin. The first request to `/admin` redirects to a
  one-time setup form that creates the single admin account.
- Passwords are hashed with bcrypt (cost 12).
- Sessions are stored in an encrypted `iron-session` cookie:
  `httpOnly`, `SameSite=Lax`, `Secure` in production, 8h lifetime.
- Middleware (`src/middleware.ts`) blocks `/admin/*` and `/api/admin/*` from
  unauthenticated users; route handlers re-verify the session.

## CSRF

- Every admin page calls `getOrCreateCsrf()` which stores a random token in the
  session and renders it into forms and fetch headers.
- API handlers call `assertCsrf()` on every state-changing request.
- The public inquiry form uses the same CSRF token mechanism, scoped to the
  anonymous visitor's session cookie.

## Uploads

- Allowlisted MIME types and extensions only: JPEG, PNG, WebP for images and
  `.glb` for 3D models.
- Magic-byte sanity check on every uploaded file.
- Maximum file size is `MAX_UPLOAD_MB` (default 25 MB).
- Files are stored under `UPLOAD_DIR` outside the Next.js public folder and
  served through the controlled `/media/:id` route, which sets
  `X-Content-Type-Options: nosniff` and an inline disposition with a safe
  filename.
- Stored filenames are randomized; original filenames are sanitized and only
  used as a display/download name.

## Rate limiting

In-process per-IP buckets are applied to:

- `/api/admin/login` — 10 per minute
- `/api/admin/setup` — 5 per minute
- `/api/admin/artworks/:id/media` — 30 per minute
- `/api/inquiries` — 5 per minute

If you run multiple replicas behind a load balancer, move this to a shared
store (Redis) before relying on the limits.

## Transport and headers

- Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, and Permissions-Policy are sent globally (see
  `next.config.mjs` and the `Caddyfile`).
- In production, Caddy automatically obtains and renews TLS certificates
  through Let's Encrypt.

## Auditing

- All admin actions (login, setup, logout, artwork CRUD, uploads, settings,
  inquiry status changes) are written to the `AuditLog` table with the user
  id, action, target, and metadata. Inquiry creation is logged anonymously.

## Backups

- Database: `docker compose exec db pg_dump -U hei hei_gallery > backup.sql`
- Media: archive the `uploads` Docker volume (see `README.md`).
- Restore order: restore the database first, then the media volume.

## Threats deliberately out of scope at launch

- Automated PayPal checkout (no card data ever reaches this server; inquiries
  and optional PayPal links keep us out of PCI scope).
- Multi-tenant authorization (single admin, one site).
- Anti-malware scanning on uploads (add ClamAV later if needed).
