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

Create `apps/api/.env` (never commit it):

```ini
NODE_ENV=production
PORT=<port assigned by cPanel, or 4000>
DATABASE_URL=mysql://tickets_user:STRONG_PASSWORD@127.0.0.1:3306/zakisu_tickets
APP_URL=https://tickets.zakisu.com
CORS_ORIGIN=https://tickets.zakisu.com
LOG_LEVEL=info
```

Notes:

- Passenger/cPanel injects `PORT`/`DSP_PORT`; the app respects `PORT`.
- `Secure` cookies and `upgrade-insecure-requests` CSP turn on automatically when
  `NODE_ENV=production`.

## 3. Install, build, migrate

```bash
npm ci
npm run build          # shared → api → web (web output: apps/web/dist)
npm run db:migrate     # applies pending migrations; safe to re-run
```

## 4. Start (cPanel "Setup Node.js App")

- Application root: the repository root
- Application startup file: `apps/api/dist/index.js`
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

Then open the site, confirm `/register` is **closed** (owner exists), and sign in.

## 6. Release checklist (every deploy)

1. `npm ci && npm run build`
2. `npm run db:migrate`
3. Restart the application
4. `curl /health/ready` → database up
5. Spot-check: sign in, open a board, drag a ticket, confirm activity recorded

## 7. Backups

- Database: nightly `mysqldump zakisu_tickets | gzip > backup-$(date +%F).sql.gz`
- JSON export/import per project arrives in Phase 4.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| `/health/ready` 503 | `DATABASE_URL` reachable from the app user; DB running |
| 502/503 on the domain | cPanel app crashed → check stderr log; `npm run build` output exists |
| Cookies not sticking | `APP_URL`/`CORS_ORIGIN` mismatch; missing HTTPS (Secure cookies) |
| 403 on mutations | Browser origin ≠ `CORS_ORIGIN` (Origin validation is strict) |
