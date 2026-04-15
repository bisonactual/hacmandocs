# HACMan Docs

A documentation and tool induction platform for [Hackspace Manchester](https://hacman.org.uk). Two systems in one codebase:

- **Docs** — Collaborative documents with versioning, edit proposals, and approval workflows. Markdown in, ProseMirror JSON stored, Markdown out.
- **Tool Inductions** — Online quizzes, certifications, expiry tracking, and trainer management for makerspace equipment.

Built on Cloudflare Workers. Deployed via GitHub Actions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| API | Hono |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM |
| Frontend | React 19 + React Router + Tailwind CSS 4 |
| Rich Text | TipTap (ProseMirror) |
| Sessions | Cloudflare KV (24h TTL) |
| Object Storage | Cloudflare R2 (images) |
| Email | Resend |
| Cron | Workers Cron Triggers (daily 08:00 UTC) |
| Testing | Vitest + fast-check (property-based) |
| CI/CD | GitHub Actions |
| Language | TypeScript (strict, ES2022) |
| Package Manager | pnpm 9 workspaces |

---

## Project Structure

```
hacmandocs/
├── packages/
│   ├── shared/               # Shared types + markdown ↔ ProseMirror conversion
│   │   └── src/
│   │       ├── types.ts          # Domain interfaces and union types
│   │       ├── markdown.ts       # remark/unified markdown parser
│   │       └── index.ts          # Public exports
│   ├── worker/               # Cloudflare Worker (API backend)
│   │   ├── src/
│   │   │   ├── index.ts          # Hono app, route mounting, cron handler
│   │   │   ├── auth/             # OAuth (GitHub/Google) + Member API auth
│   │   │   ├── db/schema.ts      # Drizzle schema (all tables)
│   │   │   ├── middleware/        # Auth, RBAC, visibility, tool access
│   │   │   ├── routes/            # API route handlers
│   │   │   └── services/          # Business logic (scoring, certs, expiry)
│   │   ├── drizzle/              # SQL migration files
│   │   └── wrangler.toml         # Worker config, D1/KV/R2 bindings, cron
│   └── web/                  # React frontend (SPA)
│       └── src/
│           ├── App.tsx            # Route definitions
│           ├── components/        # Shared UI (rich text editor, search, nav)
│           ├── pages/             # Page components (docs, admin, inductions)
│           ├── hooks/             # useAuth, useImagePaste
│           └── lib/api.ts         # API client
├── .github/workflows/        # CI + deploy pipelines
├── tsconfig.base.json
├── eslint.config.js
├── pnpm-workspace.yaml
└── package.json
```

---

## Features

### Docs System

- Create, edit, and version documents with a rich text editor (TipTap)
- Edit proposals with diff view and approval/rejection workflow
- Categories with configurable visibility (public, members-only, group-restricted)
- Full-text search with visibility-aware filtering
- Markdown import/export (bulk import from GitHub repos, ZIP export)
- Notification system for proposal updates

### Tool Induction System

- Quiz-based inductions with three quiz types per tool: main, pre-induction, and refresher
- Question types: multiple choice, true/false, multi-select
- 100% pass mark required, unlimited retakes
- Quiz lifecycle: draft → published → archived (published quizzes are immutable)
- Certifications with automatic expiry tracking
- Induction checklists managed by trainers
- In-person signoff recording with trainer/inductee confirmation
- Trainer dashboard: view completions, expirations, member progress
- Tools organised into areas with delegated area leaders
- Training leaderboard

### Image Storage (R2)

- Images are uploaded to Cloudflare R2 via the rich text editor or admin tools
- Supported formats: JPEG, PNG, GIF, WebP, SVG (max 5 MB)
- Served publicly with immutable cache headers (1 year)
- Upload requires Admin role; viewing is public
- Endpoint: `POST /api/images/upload`, `GET /api/images/:key`, `DELETE /api/images/:key`

### Certification & Expiry

- Induction certifications are permanent
- Refresher certifications expire after a configurable interval
- Daily cron job sends email notifications via Resend:
  - 14 days before expiry → warning
  - On expiry → expired notice
  - 30 days after expiry → marked as untrained
- Each notification type sent at most once per certification per cycle

---

## Authentication

Two methods, both producing KV-backed session tokens (24h TTL):

| Method | Flow |
|---|---|
| OAuth 2.0 | GitHub or Google → `/auth/oauth/login` → `/auth/oauth/callback` |
| Member API | Username/password → `/auth/member/login` → forwarded to external member system |

New users default to `Viewer`. Permission level is stored in D1 and managed by admins — never derived from external APIs.

### Dev Bypass

Set `MEMBER_API_URL=DEV_BYPASS` in `.dev.vars` and any username with password `admin` will authenticate locally.

---

## Permission Model

### Docs Roles (hierarchical)

`Viewer` → `Editor` → `Approver` → `Admin`

### Trainer Access (assignment-based, separate from docs roles)

- **Trainers** are assigned to specific tools via `tool_trainers`
- **Area leaders** manage tool areas via `area_leaders`
- Admins have implicit trainer/leader access everywhere

A Viewer can be a trainer for specific tools without gaining any docs privileges.

### Group Levels

`Member` · `Non_Member` · `Team_Leader` · `Manager` · `Board_Member`

Used for visibility-based access control on documents and categories.

---

## Development

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

### Setup

```bash
pnpm install
```

### Environment Variables

Create `packages/worker/.dev.vars`:

```env
MEMBER_API_URL=DEV_BYPASS
OAUTH_CLIENT_ID=your-github-client-id
OAUTH_CLIENT_SECRET=your-github-client-secret
OAUTH_REDIRECT_URI=http://localhost:8787/auth/oauth/callback
OAUTH_PROVIDER=github
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8787/auth/oauth/callback
FRONTEND_URL=http://localhost:5173
RESEND_API_KEY=re_your_key
```

### Running Locally

```bash
# Start the API (uses Miniflare for D1/KV/R2)
pnpm --filter @hacmandocs/worker dev

# Start the frontend
pnpm --filter @hacmandocs/web dev

# Apply migrations to local D1
pnpm --filter @hacmandocs/worker migrate
```

### Commands

```bash
# All packages
pnpm test              # Run all tests (vitest --run)
pnpm test:watch        # Watch mode
pnpm typecheck         # Type-check all packages
pnpm lint              # ESLint across all packages

# Worker
pnpm --filter @hacmandocs/worker generate   # Generate new Drizzle migration
pnpm --filter @hacmandocs/worker migrate    # Apply migrations locally
pnpm --filter @hacmandocs/worker deploy     # Deploy to Cloudflare

# Web
pnpm --filter @hacmandocs/web build         # Production build
```

---

## Testing

Property-based tests (fast-check) cover core business logic:

- Quiz scoring (single answer, multi-select, edge cases)
- Certification creation and expiry recalculation
- Expiry notification deduplication
- Induction and signoff validation
- RBAC and trainer permission checks
- Markdown round-trip preservation

Run tests:

```bash
pnpm test
```

---

## CI/CD

Two GitHub Actions workflows on `main`:

### CI (`ci.yml`)

Runs on every push and PR: lint → typecheck → test.

### Deploy (`deploy.yml`)

Runs on push to `main`:

1. **Frontend** — Builds the React app and deploys to GitHub Pages (with SPA 404 fallback)
2. **Worker** — Applies D1 migrations remotely, then deploys the Worker via Wrangler

Required GitHub secrets:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Wrangler deploy + D1 migrations |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier |
| `VITE_API_URL` | API base URL injected at build time |

---

## API Overview

### Docs

| Method | Path | Auth |
|---|---|---|
| `GET/POST/PUT/DELETE` | `/api/documents` | Optional for reads |
| `GET/POST` | `/api/categories` | Optional for reads |
| `GET/POST/PUT` | `/api/proposals` | Authenticated |
| `GET` | `/api/search` | Optional |
| `GET/POST/PUT` | `/api/users` | Authenticated |
| `GET/POST/DELETE` | `/api/groups` | Admin |
| `GET/PUT` | `/api/notifications` | Authenticated |
| `POST` | `/api/import` | Admin |
| `GET` | `/api/export` | Admin |
| `GET` | `/api/leaderboard` | Optional |

### Inductions (`/api/inductions/`)

| Method | Path | Auth |
|---|---|---|
| `GET/POST/PUT/DELETE` | `/tools`, `/tools/:id` | Any / Admin |
| `GET/POST/PUT` | `/quizzes`, `/quizzes/:id` | Any / Admin |
| `POST` | `/quizzes/:id/publish`, `/quizzes/:id/archive` | Admin |
| `GET/POST/PUT/DELETE` | `/quizzes/:id/questions` | Any / Admin |
| `POST` | `/quizzes/:id/attempt` | Authenticated |
| `GET` | `/certifications/me`, `/attempts/me`, `/profile/me` | Authenticated |
| `GET/POST/PUT/DELETE` | `/checklists/:toolId` | Any / Trainer |
| `POST` | `/signoff` | Trainer |
| `GET` | `/trainer/completions`, `/trainer/expired`, `/trainer/expiring` | Trainer |
| `GET` | `/trainer/tools/:id`, `/trainer/members/:id` | Trainer |
| `GET/POST/PUT/DELETE` | `/areas`, `/areas/:id/leaders` | Varies / Admin |
| `GET/POST/DELETE` | `/tools/:id/trainers` | Admin |

---

## Database

Cloudflare D1 (SQLite) with Drizzle ORM. Migrations are additive and non-destructive.

Key tables:

- **Docs**: `users`, `documents`, `document_versions`, `edit_proposals`, `categories`, `visibility_groups`, `visibility_group_members`, `document_visibility`, `notifications`, `permission_audit_log`
- **Inductions**: `quizzes`, `questions`, `tool_records`, `quiz_attempts`, `certifications`, `notification_emails`, `induction_checklists`, `induction_checklist_items`, `induction_signoffs`, `tool_areas`, `tool_trainers`, `area_leaders`

---

## Deployment

Deployed as a Cloudflare Worker. Requires:

- D1 database (`hacmandocs-db`)
- KV namespace for sessions
- R2 bucket for images (`hacmandocs-images`)
- Worker secrets: `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `MEMBER_API_URL`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Cron trigger: `0 8 * * *`

```bash
pnpm --filter @hacmandocs/worker deploy
```

Or push to `main` and let GitHub Actions handle it.
