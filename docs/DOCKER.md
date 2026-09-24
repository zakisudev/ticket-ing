# Docker and GitHub Container Registry

The production image contains the compiled API and React application in one
non-root Node 22 container. MySQL remains a separate service with a persistent
volume. The application applies committed Drizzle migrations before startup.

## Quick start

Requirements: Docker Engine with Docker Compose.

```bash
git clone https://github.com/zakisudev/ticket-ing.git
cd ticket-ing
cp compose.env.example compose.env
```

Generate two different URL-safe passwords and place them in `compose.env`:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Then start the stack:

```bash
docker compose --env-file compose.env pull
docker compose --env-file compose.env up -d
docker compose --env-file compose.env ps
```

Open `http://localhost:4000/register` and create the first account. Additional
users can register while `REGISTRATION_MODE=open`; each receives an isolated
workspace. To close registration later, set `REGISTRATION_MODE=closed` and
recreate the app container.

Check readiness and follow logs with:

```bash
curl --fail http://localhost:4000/health/ready
docker compose --env-file compose.env logs -f app
```

## HTTPS deployment

Put the app behind an HTTPS reverse proxy and change these values before start:

```ini
APP_URL=https://tickets.example.com
COOKIE_SECURE=true
```

Only the application port is published. MySQL is reachable solely on the
private Compose network. Do not expose port 3306 unless you have a specific,
secured operational need.

## Updating

```bash
docker compose --env-file compose.env pull app
docker compose --env-file compose.env up -d app
```

Startup migrations are idempotent. The MySQL data remains in the named
`mysql_data` volume when containers are replaced. Do not use `down --volumes`
on a deployment whose data you intend to keep.

## Backing up MySQL

This command reads credentials from the container environment and does not put
the actual password in shell history:

```bash
docker compose --env-file compose.env exec -T database sh -c \
  'exec mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  > zakisu-tickets-$(date +%F).sql
```

Store backups outside the Docker host and test restores periodically.

## Image tags and publishing

Images are published to
[`ghcr.io/zakisudev/ticket-ing`](https://github.com/zakisudev/ticket-ing/pkgs/container/ticket-ing)
by `.github/workflows/publish-container.yml`:

- `edge` and `sha-<commit>` are published from `main`.
- A tag such as `v1.2.3` publishes `1.2.3`, `1.2`, `1`, `latest`, and a commit tag.
- Images support `linux/amd64` and `linux/arm64` and include provenance and an SBOM.

The workflow authenticates with GitHub's short-lived `GITHUB_TOKEN`; no registry
password is stored in the repository. After the first successful workflow run,
open the package settings on GitHub, connect the package to this repository if
GitHub has not done so automatically, and set package visibility to **Public**.
Public GHCR images can be pulled anonymously.

To build locally without publishing:

```bash
docker build --tag zakisu-tickets:local .
ZAKISU_IMAGE=zakisu-tickets:local docker compose --env-file compose.env up -d
```

The existing cPanel/Passenger deployment remains supported and does not use
these Docker files.
