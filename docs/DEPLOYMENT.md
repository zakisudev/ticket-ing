# Deploying Zakisu Tickets (Linux / cPanel)

Target: `https://tickets.zakisu.com` as a single Node.js application serving the
API and the built SPA. No Docker required.

## 0. Prerequisites

- Node.js **22 LTS** (or any runtime ≥ 22) available to the shell/cPanel app
- MySQL 8 (or MariaDB 10.6+) with an empty database and a dedicated user
- SSH access; cPanel "Setup Node.js App" (Passenger) if using cPanel

## 1. Upload / pull the repository

```bash
cd ~/apps                      # or your cPanel application root
git clone <repo-url> zakisu-tickets   # or upload the archive
cd zakisu-tickets
```

## 2. Configure environment

Create `apps/api/.env` (never commit it). The API resolves this path relative to
its own compiled module, so it works whether the process starts from the
repository root or from `apps/api`:

```ini
NODE_ENV=production
# Omit PORT under cPanel/Passenger; it injects PORT or DSP_PORT.
DATABASE_URL=mysql://tickets_user:STRONG_PASSWORD@127.0.0.1:3306/zakisu_tickets
APP_URL=https://tickets.zakisu.com
CORS_ORIGIN=https://tickets.zakisu.com
LOG_LEVEL=info
```

Notes:

- Passenger/cPanel may inject `PORT` or `DSP_PORT`; the app supports both and
  gives an explicit `PORT` precedence.
- `Secure` cookies and `upgrade-insecure-requests` CSP turn on automatically when
  `NODE_ENV=production`.

## 3. Install and migrate

Production build artifacts are committed to the repository. The cPanel host only
needs runtime dependencies; TypeScript, Vite, Python, and a native compiler are
not required.

```bash
nvm use 22
npm ci --omit=dev
npm run db:migrate:prod   # applies pending migrations; safe to re-run
```

The API uses a bundled WebAssembly Argon2id implementation, so password hashing
does not compile a native Node addon during installation. Existing standard
Argon2id password hashes remain compatible.

## 4. Start (cPanel "Setup Node.js App")

- Application root: the repository root
- Application startup file: `app.js`
- Click **Start** (or `npm run start:api` from the shell for systemd setups)

Restart after a deploy via cPanel's **Restart** button, or:

```bash
mkdir -p tmp && touch tmp/restart.txt   # Passenger graceful restart
```

## 5. Verify

```bash
curl -s https://tickets.zakisu.com/health          # {"ok":true,...}
curl -s https://tickets.zakisu.com/health/ready    # {"ok":true,"database":"up"}
```

Dynamic `/api/*` and health responses explicitly use `Cache-Control: no-store`
so browser, Passenger, and LiteSpeed caches cannot retain authentication or
database state. Fingerprinted `/assets/*` files retain long-lived caching, while
the SPA `index.html` uses `no-cache` so deployments are discovered promptly.

For a new empty database, open `/register` immediately and create the first owner.
Registration closes automatically after that account exists; then sign out and
back in once to verify the complete authentication flow.

## 6. Release checklist (every deploy)

1. Pull a commit containing verified production artifacts
2. `npm ci --omit=dev`
3. `npm run db:migrate:prod`
4. Restart the application
5. `curl /health/ready` → database up
6. Spot-check: sign in, open a board, drag a ticket, confirm activity recorded

## 7. Producing a release locally

Run these commands on a development machine before committing a release:

```bash
npm ci --include=dev
npm test
npm run build
git add apps/api/dist apps/web/dist packages/shared/dist
```

The API build cleans its output first and excludes test files. Vite replaces the
web output on every build, including content-hashed asset filenames.

## 8. Backups

- Database: nightly `mysqldump zakisu_tickets | gzip > backup-$(date +%F).sql.gz`
- JSON export/import per project arrives in Phase 4.

## 9. Troubleshooting

| Symptom               | Check                                                            |
| --------------------- | ---------------------------------------------------------------- |
| `/health/ready` 503   | `DATABASE_URL` reachable from the app user; DB running           |
| 502/503 on the domain | cPanel app crashed → check stderr log and committed `dist` files |
| Cookies not sticking  | `APP_URL`/`CORS_ORIGIN` mismatch; missing HTTPS (Secure cookies) |
| 403 on mutations      | Browser origin ≠ `CORS_ORIGIN` (Origin validation is strict)     |
