# Hei Gallery

A ready-to-use self-hosted website for a young artist's gallery.

- Museum-style public site with featured works, collections, and per-artwork pages.
- **3D walking museum** (mouse + WASD/arrows, or dual-thumb touch controls) showing drawings on walls and ceramics on pedestals — uploaded 3D models (GLB) are supported and rotate gently.
- **Private admin area** at `/admin` for the artist or family maintainer: create/edit drawings and ceramics, upload images and GLB models, edit the personal introduction, and manage inquiries.
- **Inquiry-first sales** with an optional PayPal bridge per artwork (PayPal.me, payment, or invoice link).
- Security baked in: hashed passwords, signed encrypted session cookies, CSRF tokens, schema validation, upload allowlists with magic-byte checks, rate limiting, and strict response headers.

> Production runs on **Vercel**, with **Neon Postgres** for data and **Cloudflare R2** for images and GLB models.

## Museum controls

On desktop, use WASD/arrows to walk, click-drag to look, and a short click or E to open the focused artwork. On mobile, use the left joystick to walk and the right pad to look, including both thumbs at once; tap the focus card to open an artwork.

The pads own their touch gestures to prevent browser panning, and movement resets on release, cancellation, pause, or window blur. Page scrolling and overscroll are locked only while the museum is mounted (including loading/paused views), with prior styles restored on exit. Other pages and overlay buttons retain normal touch behavior.

---

## Deploy on Vercel (Neon Postgres + Cloudflare R2)

This is the production path. The Next.js app stays on Vercel, Prisma talks to Neon over a pooled connection string, and uploads go to R2. `npm run build` runs `prisma generate` (a placeholder `DATABASE_URL` is enough for generate). Apply the schema with `npm run prisma:deploy` against the **direct** Neon URL — do not point migrations at the pooler.

### 1. Neon

1. Create a Neon project and database.
2. Copy the **pooled** connection string (`-pooler` in the host) into `DATABASE_URL`.
3. Copy the **direct** connection string (no `-pooler`) into `DATABASE_URL_UNPOOLED`.
4. From a machine that has both variables set (or from CI), run:

```bash
npm install
npm run prisma:deploy
npm run db:seed
```

`prisma:deploy` is `prisma migrate deploy`. It applies `prisma/migrations`. Seed creates the site settings row and the two starter rooms. Then open `/admin` once to create the admin account.

### 2. Cloudflare R2

1. Create a bucket (for example `hei-gallery`).
2. Create an API token with Object Read & Write on that bucket. Put the token in `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. `R2_ACCOUNT_ID` is the Cloudflare account id (the S3 endpoint is `https://<accountid>.r2.cloudflarestorage.com`).
3. Allow public reads via the r2.dev subdomain or a custom domain. Set `R2_PUBLIC_URL` to that base, with no trailing slash (for example `https://pub-xxxx.r2.dev`). The database stores the object key (`images/…` or `models/…`); the site redirects `/media/:id` to `R2_PUBLIC_URL/<key>`.
4. Add a CORS policy so the browser can load images and GLBs, and so the admin can PUT large files directly:

```json
[
  {
    "AllowedOrigins": ["https://your-domain.vercel.app", "http://localhost:6765"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Files at or under 4 MB still upload through the admin API (magic-byte checked, then written to R2). Larger files — usually GLB models — ask for a presigned PUT URL and upload straight to R2, because Vercel request bodies are capped at 4.5 MB. After the PUT, the server checks size and file-magic bytes and only then writes the `MediaAsset` row.

### 3. Vercel

Import the Git repository. Framework preset: Next.js. Build command: `npm run build` (generates the Prisma client, then `next build`). A placeholder `DATABASE_URL` is enough for generate; the build does not connect. Do not add `prisma migrate deploy` to the build command; run it separately with the direct URL so a preview build cannot migrate through the pooler by accident.

Set these environment variables for Production (and Preview, if previews should have their own Neon branch and bucket):

| Key | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon **pooled** URL (`-pooler`). The app adds `pgbouncer=true` and `connection_limit=1` when the host contains `-pooler`. |
| `DATABASE_URL_UNPOOLED` | yes | Neon **direct** URL. Used by `npm run prisma:deploy` only. |
| `SESSION_PASSWORD` | yes | `openssl rand -base64 48`. At least 32 characters. The app refuses to boot in production without it. |
| `NEXT_PUBLIC_SITE_URL` | yes | Public site origin, e.g. `https://your-domain.vercel.app`. No trailing slash. |
| `R2_ACCOUNT_ID` | yes | Cloudflare account id. |
| `R2_ACCESS_KEY_ID` | yes | R2 token access key id. |
| `R2_SECRET_ACCESS_KEY` | yes | R2 token secret. Never commit this. |
| `R2_BUCKET` | yes | Bucket name. |
| `R2_PUBLIC_URL` | yes | Public base URL for objects. Required so GLBs are not streamed through the 4.5 MB function response cap. |
| `MAX_UPLOAD_MB` | no | Default 25. |
| `SITE_NAME` | no | Default `Hei Gallery`. |
| `PAYPAL_BUSINESS_EMAIL` | no | Optional PayPal bridge. |

Redeploy after the first `prisma migrate deploy`. Visit `/admin` to create the admin account.

### Local development

Requirements: Node.js 20+.

```bash
cp .env.example .env   # then fill DATABASE_URL, DATABASE_URL_UNPOOLED, SESSION_PASSWORD, and the R2_* vars
npm install
npm run prisma:deploy
npm run db:seed
npm run dev            # http://localhost:6765
```

`./start.sh` does the same migrate/seed/build/start sequence once `.env` points at Postgres. It will not create a SQLite file.

### Optional legacy: Docker Postgres

`docker compose up` still starts a local Postgres 16 and the app. Uploads are **not** on the old `uploads` volume — set the same `R2_*` variables in the shell before `docker compose up`. The previous single-folder SQLite + disk-upload layout is not supported by the schema anymore.

```bash
docker compose exec db pg_dump -U hei hei_gallery > backup.sql
```

Object backups are the R2 bucket (Cloudflare dashboard or `rclone`), not a zip of `./data`.

---

## Optional legacy: a VPS

A Node 20 VPS can still run the app (`npm run prisma:deploy && npm run build && npm start`), but it must use Postgres and R2 as well. A persistent disk and `file:` SQLite URL will not work. `docker-compose.prod.yml` adds Caddy when you want that VPS to terminate HTTPS. A `Procfile` remains for hosts that expect one:

```
web: node node_modules/next/dist/bin/next start -p ${PORT:-6765} -H 0.0.0.0
```

---

## Project structure

```
src/
  app/
    (public)/        Public museum site (home, collection, artwork, about, inquire, museum)
    admin/           Private admin UI (setup, login, dashboard, artworks, settings, inquiries)
    api/             REST endpoints (admin auth, artworks, uploads, settings, inquiries)
    media/[id]/      Redirect to the public R2 object (or stream it if R2_PUBLIC_URL is unset)
  components/        Site header/footer, 3D museum components
  lib/               db, auth, env, storage, validation, rate-limit, audit
prisma/              Prisma schema + seed
docker/              Container entrypoint
Dockerfile           Multi-stage build → standalone Next.js
docker-compose.yml   Local + production base
docker-compose.prod.yml  Adds Caddy + HTTPS
Caddyfile            Reverse proxy + HSTS / security headers
```

---

## Security notes

- Set `SESSION_PASSWORD` to a long random value before deploying. The app refuses to start in production with a weak value.
- All admin routes (`/admin/*` and `/api/admin/*`) require authentication; state-changing requests require a CSRF token tied to the session cookie.
- Uploads are restricted to JPEG/PNG/WebP images and `.glb` 3D models; both are checked by extension, MIME, and file-magic bytes, then stored in R2 under a random object key and served through `/media/:id`.
- Login, inquiries, and uploads are rate-limited per IP.
- A strict default Content-Security-Policy and other security headers are applied in `next.config.mjs` and the Caddyfile.
- The artist's password is hashed with bcrypt. Cookies are `httpOnly`, `SameSite=Lax`, and `Secure` in production.

---

## Roadmap (intentionally out of launch scope)

- Full PayPal Checkout (orders, capture, webhooks)
- Multi-admin roles / invitations
- Email notifications for inquiries (SMTP)
- ClamAV virus scanning profile
- WebXR / VR mode for the museum
