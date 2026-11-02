# Hei Gallery

A ready-to-use self-hosted website for a young artist's gallery.

- Museum-style public site with featured works, collections, and per-artwork pages.
- **3D walking museum** (mouse + WASD/arrows) showing drawings on walls and ceramics on pedestals — uploaded 3D models (GLB) are supported and rotate gently.
- **Private admin area** at `/admin` for the artist or family maintainer: create/edit drawings and ceramics, upload images and GLB models, edit the personal introduction, and manage inquiries.
- **Inquiry-first sales** with an optional PayPal bridge per artwork (PayPal.me, payment, or invoice link).
- Security baked in: hashed passwords, signed encrypted session cookies, CSRF tokens, schema validation, upload allowlists with magic-byte checks, rate limiting, and strict response headers.

> Runs on plain Node.js 20+. No Docker, no separate database server. All data (SQLite + uploads) lives in a single `./data/` folder — backup = zip that folder.

---

## Quick start (local, no Docker)

Requirements: **Node.js 20+** (download the LTS installer from <https://nodejs.org/>).

### macOS one-click start

Double-click `start.command` in Finder. On first run it will:

1. Generate `.env` with a strong random session password.
2. Run `npm install`.
3. Create the SQLite database at `data/hei.db` and seed the two starter rooms.
4. Build the site.
5. Start the server on <http://localhost:6765> and open it in your browser.

The first visit to `/admin` walks you through creating the single admin account.

To stop, double-click `stop.command`.

### Terminal start

```bash
./start.sh   # start (and rebuild only if needed)
./stop.sh    # stop
```

### Backups

```bash
# Everything (database + uploaded images/3D models) is one folder
tar czf hei-backup-$(date +%F).tar.gz data
```

---

## Online hosting (no Docker required)

The app is a standard Next.js + SQLite Node service. It runs on any host that supports Node 20+ with a writable disk. Recommended cheap hosts:

### Render.com (easiest)

1. Push this folder to GitHub.
2. Render → **New → Web Service** → connect the repo.
3. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate && npx prisma db push --skip-generate && npm run build`
   - **Start Command:** `node node_modules/next/dist/bin/next start -p $PORT -H 0.0.0.0`
4. Add a **Persistent Disk**, mount path `/var/data`, size 1 GB.
5. Environment variables:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `SESSION_PASSWORD` | (generate: `openssl rand -base64 48`) |
   | `DATABASE_URL` | `file:/var/data/hei.db` (absolute paths work as-is) |
   | `UPLOAD_DIR` | `/var/data/uploads` |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-app>.onrender.com` |

6. Deploy. Visit `/admin` to create the admin account.

### Railway / Fly.io / any VPS

Same idea — Node 20+, attach a persistent volume, set `DATABASE_URL=file:/data/hei.db` and `UPLOAD_DIR=/data/uploads` pointing into that volume. A `Procfile` is included for Heroku-style platforms:

```
web: node node_modules/next/dist/bin/next start -p ${PORT:-6765} -H 0.0.0.0
```

### Plain VPS (DigitalOcean, Hetzner, etc.) with HTTPS

```bash
# On the server (Ubuntu 22.04+ example):
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git caddy
git clone <your repo> /opt/hei && cd /opt/hei
cp .env.example .env && nano .env   # set SESSION_PASSWORD and NEXT_PUBLIC_SITE_URL=https://your.domain
npm install
npx prisma db push --skip-generate
npm run build
sudo npm i -g pm2
pm2 start "npm start" --name hei
pm2 save && pm2 startup
```

Then put Caddy in front of it for free HTTPS — `/etc/caddy/Caddyfile`:

```
your.domain {
  reverse_proxy 127.0.0.1:6765
}
```

```bash
sudo systemctl reload caddy
```

### Note about serverless hosts (Vercel, Netlify, Cloudflare Pages)

These have **ephemeral filesystems**, so SQLite and local uploads will be wiped between deploys/cold starts. If you want to use them, switch `DATABASE_URL` to a hosted Postgres (e.g. Neon free tier) and use object storage (S3/R2) for uploads — extra setup. For a personal gallery, a $5 VPS or Render with a persistent disk is simpler and cheaper.

### Optional: Docker path

`Dockerfile`, `docker-compose.yml`, and `docker-compose.prod.yml` (with Caddy + HTTPS) are kept in the repo for users who already use Docker. They are **not required** — the no-Docker flow above is the recommended default.

---

## Project structure

```
src/
  app/
    (public)/        Public museum site (home, collection, artwork, about, inquire, museum)
    admin/           Private admin UI (setup, login, dashboard, artworks, settings, inquiries)
    api/             REST endpoints (admin auth, artworks, uploads, settings, inquiries)
    media/[id]/      Authenticated-or-public stream of stored media by asset id
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
- Uploads are restricted to JPEG/PNG/WebP images and `.glb` 3D models; both are checked by extension, MIME, and file-magic bytes, then stored outside the Next.js public folder and served through `/media/:id`.
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
