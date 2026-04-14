# hacmandocs

A document management and tool induction platform for the Hackspace Manchester (HACMan) makerspace community. Built on Cloudflare Workers.

## What it does

Two systems in one:

1. **Docs System** — Collaborative document management with versioning, edit proposals, approval workflows, and visibility groups. Markdown in, ProseMirror JSON stored, Markdown out.

2. **Tool Induction System** — Online quizzes for tool inductions and refresher training. Members take quizzes (100% pass mark, unlimited attempts), earn certifications, and get email reminders when refresher training is due. Trainers sign off in-person inductions and monitor member progress. Tools are organised into areas with delegated area leaders.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| API Framework | Hono |
| Database | Cloudflare D1 (SQLite) |
| ORM | Drizzle ORM |
| Sessions | Cloudflare KV |
| Email | Resend (REST API via `fetch`) |
| Scheduled Jobs | Workers Cron Triggers (daily at 08:00 UTC) |
| Package Manager | pnpm 9 (workspaces) |
| Language | TypeScript (strict, ES2022) |
| Testing | Vitest + fast-check (property-based) |

## Project Structure

```
hacmandocs/
├── packages/
│   ├── shared/           # Shared types, markdown parser (remark/unified)
│   │   └── src/
│   │       ├── types.ts       # All domain interfaces and union types
│   │       ├── markdown.ts    # Markdown ↔ ProseMirror conversion
│   │       └── index.ts       # Public exports
│   └── worker/           # Cloudflare Worker (API backend)
│       ├── src/
│       │   ├── index.ts       # Hono app, route mounting, scheduled handler
│       │   ├── auth/          # OAuth (GitHub) + Makerspace Member API auth
│       │   ├── db/schema.ts   # Drizzle schema (all tables)
│       │   ├── middleware/     # Auth, RBAC, visibility, tool access, username check
│       │   ├── routes/        # API route handlers
│       │   └── services/      # Business logic (scoring, certification, expiry, validators)
│       ├── drizzle/           # SQL migration files (0000–0007)
│       └── wrangler.toml      # Worker config, D1/KV bindings, cron trigger
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

## Authentication

Two methods, both producing KV-backed session tokens (24h TTL):

- **OAuth 2.0** — GitHub login (`/auth/oauth/login` → `/auth/oauth/callback`)
- **Makerspace Member API** — Username/password forwarded to the external member system (`/auth/member/login`)

New users default to `Viewer` permission level. Permission is never derived from external APIs — it's stored in D1 and managed by admins.

A `DEV_BYPASS` mode exists for local development: set `MEMBER_API_URL=DEV_BYPASS` in `.dev.vars` and any username with password `admin` will authenticate.

## Permission Model

Four hierarchical roles for the docs system:

`Viewer` → `Editor` → `Approver` → `Admin`

Trainer access is separate — it's based on assignment, not a role in the hierarchy:
- Users are assigned as **trainers** to specific tools (via `tool_trainers`)
- Users can be **area leaders** for tool areas (via `area_leaders`)
- Admins always have implicit trainer/leader access

This means a Viewer can also be a trainer for specific tools without gaining any docs system privileges.

## API Routes

All induction routes are mounted under `/api/inductions/`.

### Docs System

| Method | Path | Auth |
|---|---|---|
| `GET/POST/PUT/DELETE` | `/api/documents` | Varies (optional auth for reads) |
| `GET/POST` | `/api/categories` | Optional auth for reads, auth for writes |
| `GET/POST/PUT` | `/api/proposals` | Authenticated |
| `GET` | `/api/search` | Optional auth |
| `GET/POST/PUT` | `/api/users` | Authenticated |
| `GET/POST/DELETE` | `/api/groups` | Admin |
| `GET/PUT` | `/api/notifications` | Authenticated |
| `POST` | `/api/import` | Admin |
| `GET` | `/api/export` | Admin |

### Tool Induction System

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/inductions/tools` | Any | List all tool records |
| `POST` | `/api/inductions/tools` | Admin | Create tool record |
| `PUT/DELETE` | `/api/inductions/tools/:id` | Admin | Update/delete tool record |
| `GET` | `/api/inductions/quizzes` | Any | List quizzes |
| `POST` | `/api/inductions/quizzes` | Admin | Create quiz |
| `POST` | `/api/inductions/quizzes/import` | Admin | Bulk import quizzes from JSON |
| `GET/PUT` | `/api/inductions/quizzes/:id` | Any / Admin | Get / update quiz |
| `POST` | `/api/inductions/quizzes/:id/publish` | Admin | Publish quiz |
| `POST` | `/api/inductions/quizzes/:id/archive` | Admin | Archive quiz |
| `GET/POST` | `/api/inductions/quizzes/:id/questions` | Any / Admin | List / add questions |
| `PUT/DELETE` | `/api/inductions/quizzes/:qid/questions/:id` | Admin | Edit / delete question |
| `POST` | `/api/inductions/quizzes/:id/attempt` | Any | Submit quiz attempt |
| `GET` | `/api/inductions/certifications/me` | Any | My certifications |
| `GET` | `/api/inductions/attempts/me` | Any | My attempt history |
| `GET` | `/api/inductions/profile/me` | Any | Member profile (available/completed/expired tools) |
| `GET` | `/api/inductions/checklists/:toolId` | Any | Get induction checklist |
| `POST/PUT/DELETE` | `/api/inductions/checklists/...` | Trainer | Manage checklist sections & items |
| `POST` | `/api/inductions/signoff` | Trainer | Record in-person induction signoff |
| `POST` | `/api/inductions/tools/:id/mark-trained` | Any | Self-mark as trained |
| `POST` | `/api/inductions/trainer/tools/:id/mark-trained/:uid` | Trainer | Mark user as trained |
| `GET` | `/api/inductions/trainer/completions` | Trainer | Members with active certs |
| `GET` | `/api/inductions/trainer/expired` | Trainer | Members with expired certs |
| `GET` | `/api/inductions/trainer/expiring` | Trainer | Certs expiring within 30 days |
| `GET` | `/api/inductions/trainer/tools/:id` | Trainer | All members for a tool |
| `GET` | `/api/inductions/trainer/members/:id` | Trainer | All certs for a member |
| `GET` | `/api/inductions/trainer/search` | Trainer | Search/filter members |
| `GET` | `/api/inductions/trainer/attempts` | Trainer | All quiz attempts |
| `GET` | `/api/inductions/trainer/signoffs` | Trainer | Search signoff records |
| `GET/POST/PUT/DELETE` | `/api/inductions/areas` | Varies | Tool area management |
| `GET/POST/DELETE` | `/api/inductions/areas/:id/leaders` | Admin | Area leader assignments |
| `GET/POST/DELETE` | `/api/inductions/tools/:id/trainers` | Admin | Tool trainer assignments |

## Database

Cloudflare D1 (SQLite) with Drizzle ORM. 8 migrations so far (`0000`–`0007`).

Key tables:

- **Docs**: `users`, `documents`, `document_versions`, `edit_proposals`, `categories`, `visibility_groups`, `visibility_group_members`, `document_visibility`, `notifications`, `permission_audit_log`
- **Inductions**: `quizzes`, `questions`, `tool_records`, `quiz_attempts`, `certifications`, `notification_emails`, `induction_checklists`, `induction_checklist_items`, `induction_signoffs`, `tool_areas`, `tool_trainers`, `area_leaders`

## Quiz System

- Question types: `multiple_choice`, `true_false`, `multi_select`
- 100% pass mark required on all quizzes
- Unlimited retakes
- Quiz lifecycle: `draft` → `published` → `archived`
- Published quizzes are immutable (existing questions can't be edited, but new ones can be added)
- Quizzes can optionally show which questions were wrong on failure (`showWrongAnswers`)
- Tool records can have up to three associated quizzes: main induction, pre-induction, and refresher
- Pre-induction quizzes record a pass but don't create a certification

## Certification & Expiry

- Certifications are created when a member passes an induction/refresher quiz, or via trainer signoff
- Refresher certs have an expiry date (`completedAt + retrainingIntervalDays * 86400`)
- Induction certs are permanent (no expiry)
- A daily cron job (08:00 UTC) checks for expiring certs and sends emails via Resend:
  - 14 days before expiry: warning email
  - On expiry: expired email
  - 30 days after expiry: final "marked as untrained" email
- Each notification type is sent at most once per certification per expiry cycle

## Development

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

### Setup

```bash
pnpm install
```

### Local Development

```bash
# Run the worker locally (uses Miniflare for D1/KV)
pnpm --filter @hacmandocs/worker dev

# Apply migrations to local D1
pnpm --filter @hacmandocs/worker migrate
```

Create `packages/worker/.dev.vars` for local secrets:

```
MEMBER_API_URL=DEV_BYPASS
OAUTH_CLIENT_ID=your-github-client-id
OAUTH_CLIENT_SECRET=your-github-client-secret
OAUTH_REDIRECT_URI=http://localhost:8787/auth/oauth/callback
OAUTH_PROVIDER=github
RESEND_API_KEY=re_your_key
```

### Commands

```bash
pnpm test              # Run all tests (vitest --run)
pnpm test:watch        # Watch mode
pnpm typecheck         # Type-check all packages
pnpm lint              # ESLint across all packages

# Worker-specific
pnpm --filter @hacmandocs/worker generate   # Generate new Drizzle migration
pnpm --filter @hacmandocs/worker migrate    # Apply migrations locally
pnpm --filter @hacmandocs/worker deploy     # Deploy to Cloudflare
```

### Testing

Property-based tests (fast-check) cover the core business logic:
- Quiz scoring (single answer, multi-select, edge cases)
- Certification creation and expiry recalculation
- Expiry notification deduplication
- Induction/signoff validation
- RBAC and trainer permission checks
- Member tool partitioning

## Deployment

Deployed as a Cloudflare Worker via `wrangler deploy`. Requires:

- A D1 database (`hacmandocs-db`)
- A KV namespace for sessions
- Worker secrets: `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `MEMBER_API_URL`, `RESEND_API_KEY`
- Cron trigger configured for `0 8 * * *`
