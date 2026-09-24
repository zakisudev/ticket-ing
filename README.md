# Zakisu Tickets

Self-hosted engineering ticket tracker for a solo developer — the external memory
system behind **[tickets.zakisu.com](https://tickets.zakisu.com)**.

Not a Jira clone. Trello simplicity + engineering task history + deployment
tracking. Built to answer, months from now: *what was requested, approved,
implemented, tested, deployed — and what was deliberately postponed?*

## Core ideas

- **Workflow discipline (product invariant)**: `status` is the lifecycle —
  `PLANNED → IN_PROGRESS → IMPLEMENTED → TESTED → DEPLOYED` — and answers *how far
  has this work progressed?* IMPLEMENTED means source-complete; TESTED means
  verification passed; DEPLOYED means released. They are never conflated.
- **Blocked is a condition, not a state (product invariant)**: `isBlocked` +
  `blockedReason` answer *can work currently continue?* — orthogonal to status.
  A ticket can be `IMPLEMENTED` and blocked; its card stays in the IMPLEMENTED
  column with a BLOCKED badge. Blocking requires a non-empty reason; unblocking
  clears the live reason but preserves it in `UNBLOCKED` activity.
- **Archive is a condition, not a state (product invariant)**: `archivedAt != null`
  hides a ticket from the board by default (`archived=only` shows the archive
  view) and never touches lifecycle status or milestones.
- **Milestone timestamps are set once** (first entry into a state) and never erased
  by moving backward. Every transition is recorded in the activity history.
- **Limitations are first-class**: implemented work usually has caveats; they get
  their own field, not a comment thread.
- **Activity history in the same transaction as every mutation** — product history
  can never drift from state.
- **Ticket numbers are per-project, atomic, and never reused** (`TMR-001`).

## Architecture

npm-workspaces monorepo, one lockfile:

| Workspace | Stack |
|---|---|
| `apps/api` | Express 5, TypeScript, Drizzle ORM, MySQL 8, argon2id sessions, pino |
| `apps/web` | React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Query, dnd-kit, React Hook Form + Zod |
| `packages/shared` | Zod schemas, enums, DTOs, error contract — single source of truth |

Production runs as **one Node process**: Express serves the REST API under `/api`,
the built SPA statically, and `/health` + `/health/ready`. This shape is
deliberately cPanel/"Setup Node.js App" friendly.

### Database (MySQL 8 / MariaDB-compatible)

`users`, `sessions`, `projects`, `project_ticket_counters`, `tickets`,
`ticket_activities`, `ticket_checklist_items`, `ticket_links`,
`ticket_relations`, `tags` (project-scoped, unique `slug`), `ticket_tags`.
All IDs are CHAR(36); display IDs (`TMR-042`) are derived from the
current project key. Ticket numbering uses
`UPDATE ... SET last_number = LAST_INSERT_ID(last_number + 1)` — concurrency-safe
without `MAX()+1`. A nullable `tickets.import_key` (unique per project) is reserved
for the Phase 4 historical import; nothing populates it yet.

**Relations are canonical**: exactly one row per relationship is stored
(`A BLOCKS B`); the inverse presentation (`B blocked by A`) is derived at read
time and never persisted. `RELATED_TO` is symmetric — whichever direction is
created first becomes the canonical row. `BLOCKED_BY` as a stored type does not
exist. Relations stay within one project for V1.

**Markdown** in long fields is rendered with `react-markdown` + `remark-gfm` and
sanitized with `rehype-sanitize` — raw HTML, event handlers, and
`javascript:`/`data:` URLs are stripped before anything reaches the DOM.

## Local setup

Requirements: Node ≥ 22, npm 10+, a MySQL 8 (or MariaDB) server.

```bash
npm install
cp .env.example apps/api/.env        # then edit values
npm run db:migrate                   # applies drizzle migrations
npm run dev                          # api on :4000, web on :5173 (proxied)
```

`apps/api/.env` example values:

```
DATABASE_URL=mysql://user:password@127.0.0.1:3306/zakisu_tickets
APP_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
```

### First run

Open `/register` in the web app and create an account. Registration remains open
for additional users, and each account gets a private owner-scoped workspace.
Set `REGISTRATION_MODE=closed` to disable new signups. There is no seeded or
default password anywhere.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | API + web with watch |
| `npm run build` | Typecheck + build all workspaces |
| `npm run typecheck` | TypeScript, all workspaces |
| `npm run lint` | ESLint (flat config) |
| `npm test` | API tests (real MySQL) + web component tests |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |

### API tests

Tests run against a **real MySQL database** (`TEST_DATABASE_URL`, default
`zakisu_tickets_test`) — concurrency behavior (registration race, ticket numbering)
is verified against actual MySQL, not mocks. See `apps/api/vitest.config.ts`.

## Environment variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | Listen port (default 4000) |
| `DATABASE_URL` | MySQL connection string |
| `APP_URL` | Public URL (production: `https://tickets.zakisu.com`) |
| `CORS_ORIGIN` | Allowed browser origin (defaults to APP_URL) |
| `LOG_LEVEL` | `debug` `info` `warn` `error` `silent` |
| `WEB_DIST` | Optional override for the built SPA directory |
| `LOGIN_RATE_MAX` / `LOGIN_RATE_WINDOW_MS` | Login rate limiting |
| `REGISTRATION_MODE` | `open` (default) or `closed` for new signups |
| `REGISTRATION_RATE_MAX` / `REGISTRATION_RATE_WINDOW_MS` | Per-IP registration rate limiting |
| `SESSION_TTL_DAYS` | Session lifetime (default 30) |

Never commit real credentials — `.env` files are gitignored; `.env.example` holds
placeholders only.

## Security model

- argon2id password hashing (19 MiB / 3 passes); opaque session tokens, only
  SHA-256 hashes stored; HttpOnly + SameSite=Lax + Secure(in production) cookies.
- Registration is open by default, can be disabled by configuration, and is
  rate-limited per IP. Each user owns an isolated workspace; `users.email`
  uniqueness is the duplicate/race backstop.
- Generic login failure message; per-IP+email rate limiting (429 RATE_LIMITED).
- Helmet + strict CSP, pinned CORS, Origin validation on state-changing requests.
- Zod validation on every route; Drizzle parameterized queries throughout.
- Ownership enforced server-side on every resource; foreign resources return **404**
  (existence is never leaked).
- Optimistic concurrency on tickets: PATCH requires `version`; mismatch → `409
  STALE_UPDATE`. The UI rolls back and refetches instead of overwriting.

## Backup / export

Phase 1 stores all state in MySQL. Recommended: dump the database
(`mysqldump zakisu_tickets`). JSON project export/import and Markdown context
export arrive in Phase 4.

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the Linux/cPanel walk-through.
Do not deploy before the production checklist there is satisfied.
