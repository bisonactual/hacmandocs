# Implementation Plan: Tool Induction System

## Overview

Extend the existing hacmandocs platform with tool induction and refresher training. Implementation proceeds bottom-up: shared types → DB schema migration → pure service logic (with property tests) → API routes → frontend pages → cron handler → wiring and integration. The trainer capability is implemented as an `is_trainer` boolean flag on the existing `users` table, not as a new permission level.

## Tasks

- [x] 1. Add shared types and extend the users schema with `is_trainer` flag
  - [x] 1.1 Add induction domain types to `packages/shared/src/types.ts`
    - Add `QuizType`, `QuizStatus`, `QuestionType`, `CertificationStatus`, `ExpiryNotificationType` union types
    - Add `ToolRecord`, `Quiz`, `Question`, `QuizAttempt`, `Certification` interfaces
    - Add `isTrainer` boolean field to the existing `User` interface
    - Do NOT modify the existing `PermissionLevel` type — it stays as `'Viewer' | 'Editor' | 'Approver' | 'Admin'`
    - _Requirements: 9.6, 5.1_

  - [x] 1.2 Add `is_trainer` column to users table in Drizzle schema
    - Add `isTrainer: integer("is_trainer").notNull().default(0)` to the existing `users` table in `packages/worker/src/db/schema.ts`
    - _Requirements: 5.1, 9.3_

  - [x] 1.3 Add induction tables to Drizzle schema
    - Add `quizzes`, `questions`, `toolRecords`, `quizAttempts`, `certifications`, `notificationEmails` tables to `packages/worker/src/db/schema.ts` as specified in the design
    - All tables reference the existing `users` table by foreign key
    - Include CHECK constraints for enum-like columns
    - _Requirements: 9.6_

  - [x] 1.4 Generate Drizzle migration
    - Run `pnpm drizzle-kit generate` from `packages/worker` to create the migration SQL file
    - Verify the migration adds `is_trainer` to users and creates all new induction tables
    - _Requirements: 9.6_

- [x] 2. Implement pure service logic (quiz scoring, certification, expiry notifications)
  - [x] 2.1 Implement quiz scoring service in `packages/worker/src/services/quiz-scoring.ts`
    - `scoreAttempt(questions, answers)` → `{ score, passed, correctCount, totalCount }`
    - Score = `Math.round((correctCount / totalCount) * 100)`, passed = score === 100
    - _Requirements: 3.2, 3.3_

  - [x] 2.2 Write property test for quiz scoring (Property 6)
    - **Property 6: Quiz scoring and attempt recording**
    - Generate random question sets and answer arrays, verify score = round((correct/total)*100), passed iff score === 100
    - **Validates: Requirements 3.2, 3.3, 3.8**

  - [x] 2.3 Implement certification service in `packages/worker/src/services/certification.ts`
    - `createCertification(userId, toolRecord, quizAttemptId, completedAt)` → Certification with correct expiresAt
    - `recalculateExpiry(certification, newIntervalDays)` → updated Certification
    - `getStatus(certification, now)` → CertificationStatus
    - _Requirements: 3.4, 3.5, 4.3, 4.4, 7.1, 7.4_

  - [x] 2.4 Write property test for certification creation (Property 7)
    - **Property 7: Certification creation from passing attempt**
    - Generate random passing attempts on both tool types, verify expiresAt logic
    - **Validates: Requirements 3.4, 3.5**

  - [x] 2.5 Write property test for certification status computation (Property 8)
    - **Property 8: Certification status computation**
    - Generate random certifications and timestamps, verify status rules
    - **Validates: Requirements 4.3, 4.4, 7.1, 7.4**

  - [x] 2.6 Write property test for retraining interval recalculation (Property 3)
    - **Property 3: Retraining interval recalculation**
    - Generate random certifications with varying completedAt and new intervals, verify recalculated expiresAt
    - **Validates: Requirements 1.6**

  - [x] 2.7 Implement expiry notification service in `packages/worker/src/services/expiry-notifications.ts`
    - `getNotificationsToSend(certifications, alreadySent, now)` → array of notifications to send
    - Implements warning_14d, expired, post_expiry_30d logic with deduplication
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 2.8 Write property test for expiry notification scheduling (Property 13)
    - **Property 13: Expiry notification scheduling with deduplication**
    - Generate random cert sets with varying expiry dates and already-sent records, verify scheduling and dedup
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [x] 2.9 Implement validation helpers in `packages/worker/src/services/induction-validators.ts`
    - `validateToolRecord(payload)` — validates name, quizType, quizId, retrainingIntervalDays
    - `validateQuestion(payload)` — validates questionText, questionType, options, correctOptionIndex
    - `partitionMemberTools(toolRecords, certifications, now)` — returns available/completed/expired lists
    - `sortByExpiry(certifications)` — sorts refresher certs by expiresAt ascending
    - _Requirements: 1.1, 1.2, 1.3, 2.2, 4.1, 4.2, 4.5_

  - [x] 2.10 Write property tests for validation and partitioning
    - **Property 1: Tool record validation** — Generate random payloads, verify accept/reject
    - **Property 4: Question validation** — Generate random payloads, verify accept/reject
    - **Property 9: Member profile available vs completed partitioning** — Verify no overlaps, full coverage
    - **Property 10: Refresher certification sorting** — Verify ascending expiresAt order
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.2, 4.1, 4.2, 4.5**

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `requireTrainer` middleware and admin `is_trainer` toggle API
  - [x] 4.1 Add `requireTrainer` middleware to `packages/worker/src/middleware/rbac.ts`
    - Add `requireTrainer()` function that checks `session.isTrainer === true` OR `session.permissionLevel === 'Admin'`
    - Do NOT modify the existing `requireRole` function or `LEVEL_RANK` map
    - _Requirements: 5.2, 6.7_

  - [x] 4.2 Update session creation to include `isTrainer` flag
    - Update `packages/worker/src/auth/session.ts` SessionData interface to include `isTrainer: boolean`
    - Update session creation in OAuth and member auth flows to read `is_trainer` from the user record and include it in the session
    - _Requirements: 5.1, 9.1_

  - [x] 4.3 Add `is_trainer` toggle endpoint to existing users routes
    - Add `PUT /api/users/:id/trainer` endpoint in `packages/worker/src/routes/users.ts`
    - Requires Admin permission (use existing `requireRole('Admin')`)
    - Accepts `{ isTrainer: boolean }`, updates the `is_trainer` column
    - _Requirements: 5.3_

  - [x] 4.4 Write property test for induction RBAC (Property 11)
    - **Property 11: Induction system RBAC**
    - Generate random (role, is_trainer, action) tuples, verify access matrix
    - **Validates: Requirements 2.6, 5.2, 5.4, 5.5, 5.6, 6.7, 9.3, 9.4**

- [-] 5. Implement Tool Record and Quiz CRUD API routes
  - [x] 5.1 Create induction route module at `packages/worker/src/routes/inductions.ts`
    - Create a new Hono sub-app for `/api/inductions/*`
    - Mount it in `packages/worker/src/index.ts` with `app.route("/api/inductions", inductionsApp)`
    - _Requirements: 9.7_

  - [x] 5.2 Implement Tool Record CRUD endpoints
    - `GET /api/inductions/tools` — list all tool records
    - `POST /api/inductions/tools` — create tool record (Admin only, uses validateToolRecord)
    - `PUT /api/inductions/tools/:id` — update tool record (Admin only, recalculate cert expiry if interval changed)
    - `DELETE /api/inductions/tools/:id` — delete tool record (Admin only)
    - Return 409 on duplicate name, 400 on validation failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 5.3 Write property test for duplicate tool name rejection (Property 2)
    - **Property 2: Duplicate tool name rejection**
    - **Validates: Requirements 1.4**

  - [x] 5.4 Implement Quiz CRUD endpoints
    - `GET /api/inductions/quizzes` — list all quizzes
    - `GET /api/inductions/quizzes/:id` — get quiz with questions
    - `POST /api/inductions/quizzes` — create quiz (Admin only)
    - `PUT /api/inductions/quizzes/:id` — update quiz title (Admin only)
    - `POST /api/inductions/quizzes/:id/publish` — publish quiz (Admin only, reject if 0 questions)
    - `POST /api/inductions/quizzes/:id/archive` — archive quiz (Admin only)
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6_

  - [x] 5.5 Implement Question CRUD endpoints
    - `GET /api/inductions/quizzes/:id/questions` — list questions for a quiz
    - `POST /api/inductions/quizzes/:id/questions` — add question (Admin only, uses validateQuestion)
    - `PUT /api/inductions/quizzes/:quizId/questions/:questionId` — update question (Admin only, reject if quiz published)
    - `DELETE /api/inductions/quizzes/:quizId/questions/:questionId` — delete question (Admin only, reject if quiz published)
    - _Requirements: 2.2, 2.3_

  - [x] 5.6 Write property test for published quiz immutability (Property 5)
    - **Property 5: Published quiz immutability**
    - **Validates: Requirements 2.3**

  - [x] 5.7 Add `description` field to quizzes table and schema
    - Add `description: text("description")` column to the `quizzes` table in Drizzle schema (nullable, stores Markdown/HTML for preamble content including text, embedded YouTube videos, multi-page explanations)
    - Update the `Quiz` interface in `packages/shared/src/types.ts` to include `description: string | null`
    - Generate a new Drizzle migration
    - _Requirements: N/A (import support)_

  - [x] 5.8 Implement Google Forms quiz import endpoint
    - Create `POST /api/inductions/quizzes/import` endpoint (Admin only)
    - Accepts JSON payload: `{ title, description?, questions: [{ questionText, questionType, options, correctOptionIndex }] }`
    - Creates a quiz in `draft` status with all questions, ready to review and publish
    - Also accept a batch import: `{ quizzes: [{ title, description?, questions: [...] }] }` to import multiple quizzes at once
    - _Requirements: N/A (import support)_

  - [x] 5.9 Create Google Apps Script for exporting Google Forms
    - Create a standalone Google Apps Script file at `scripts/export-google-forms.gs`
    - The script uses `FormApp` to iterate over form items, extract questions, options, correct answers, section descriptions, and embedded content
    - Outputs a JSON file matching the import endpoint's expected format
    - Include instructions in a README comment at the top of the script
    - _Requirements: N/A (import support)_

- [x] 6. Implement Quiz Attempt and Certification API routes
  - [x] 6.1 Implement quiz attempt submission endpoint
    - `POST /api/inductions/quizzes/:id/attempt` — submit answers, score using quiz scoring service
    - Reject if quiz not published, if answers incomplete, if answer indices invalid
    - On pass (score=100): create certification using certification service
    - On fail: return score and prompt to retake
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 6.2 Implement certification and attempt history endpoints
    - `GET /api/inductions/certifications/me` — get current user's certifications with computed status
    - `GET /api/inductions/attempts/me` — get current user's attempt history
    - `GET /api/inductions/profile/me` — get member profile data (available tools, completed certs, expired certs) using partitionMemberTools
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 6.3 Write property test for certification renewal (Property 12)
    - **Property 12: Certification renewal preserves history**
    - **Validates: Requirements 7.3**

- [x] 7. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Trainer Dashboard API routes
  - [x] 8.1 Implement trainer dashboard endpoints
    - `GET /api/inductions/trainer/completions` — list members who completed online inductions (protected by requireTrainer)
    - `GET /api/inductions/trainer/expired` — list members with expired refresher certs
    - `GET /api/inductions/trainer/expiring` — list members with certs expiring within 30 days
    - `GET /api/inductions/trainer/tools/:id` — all members for a specific tool with cert status
    - `GET /api/inductions/trainer/members/:id` — all certs for a specific member
    - `GET /api/inductions/trainer/search` — filter/search by name, tool, status
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 9. Implement scheduled handler for expiry email notifications
  - [x] 9.1 Implement `processExpiryNotifications` in `packages/worker/src/services/expiry-cron.ts`
    - Query certifications for expiring/expired refresher certs
    - Use expiry notification service to determine which emails to send
    - Send emails via Resend REST API (`POST https://api.resend.com/emails`)
    - Record each send attempt in `notification_emails` table (success or failure)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 9.2 Add scheduled export to worker entry point
    - Update `packages/worker/src/index.ts` to export `{ fetch: app.fetch, scheduled: ... }`
    - Add `RESEND_API_KEY` to the `Env.Bindings` type
    - _Requirements: 8.1_

  - [x] 9.3 Update `packages/worker/wrangler.toml` with cron trigger
    - Add `[triggers]` section with `crons = ["0 8 * * *"]`
    - _Requirements: 8.1_

- [x] 10. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement frontend pages — Member Profile and Quiz Taking
  - [x] 11.1 Create `MemberProfilePage` at `packages/web/src/pages/inductions/MemberProfilePage.tsx`
    - Fetch profile data from `GET /api/inductions/profile/me`
    - Display available tools with "Start Quiz" links, completed certs with dates, expiring certs with days remaining, expired certs with "Retake" links
    - Sort refresher certs by expiry ascending
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 11.2 Create `QuizTakingPage` at `packages/web/src/pages/inductions/QuizTakingPage.tsx`
    - Fetch quiz and questions from `GET /api/inductions/quizzes/:id`
    - Present all questions with radio buttons for answer selection
    - Submit answers to `POST /api/inductions/quizzes/:id/attempt`
    - Display result: pass (with certification confirmation) or fail (with retake prompt)
    - _Requirements: 3.1, 3.2, 3.6_

- [x] 12. Implement frontend pages — Trainer Dashboard
  - [x] 12.1 Create `TrainerDashboardPage` at `packages/web/src/pages/inductions/TrainerDashboardPage.tsx`
    - Tabs or sections for: recent completions, expired certs, expiring-soon certs
    - Filter/search by member name, tool name, certification status
    - Click-through to member detail and tool detail views
    - Protect route: only render for users with `isTrainer` or Admin permission
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 13. Implement frontend pages — Admin Tool & Quiz Management
  - [x] 13.1 Create `AdminToolsPage` at `packages/web/src/pages/admin/ToolsPage.tsx`
    - List all tool records with name, quiz type, retraining interval
    - Create/edit/delete tool records with form validation
    - Quiz selector dropdown (fetches from quizzes API)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 13.2 Create `AdminQuizzesPage` at `packages/web/src/pages/admin/QuizzesPage.tsx`
    - List all quizzes with title, status, question count
    - Create quiz, edit title, publish, archive actions
    - Inline question editor: add/edit/delete questions with options and correct answer
    - Enforce published quiz immutability in UI (disable edit/delete on published questions)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 13.3 Add "Trainer" toggle checkbox to `UsersPage`
    - Update `packages/web/src/pages/admin/UsersPage.tsx` to show an `is_trainer` checkbox next to the permission dropdown for each user
    - Toggling calls `PUT /api/users/:id/trainer` with `{ isTrainer: boolean }`
    - _Requirements: 5.3_

- [x] 14. Wire frontend routes and navigation
  - [x] 14.1 Add induction routes to `packages/web/src/App.tsx`
    - Add `/inductions/profile`, `/inductions/quiz/:id`, `/inductions/trainer` as protected routes inside the Layout
    - Add `/admin/tools` and `/admin/quizzes` as admin sub-routes
    - _Requirements: 9.7_

  - [x] 14.2 Update `NavigationSidebar` with induction links
    - Add "Inductions" section with "My Training" link for all authenticated users
    - Show "Trainer Dashboard" link for users with `isTrainer` or Admin permission
    - Show "Manage Tools" and "Manage Quizzes" links for Admin users under the existing admin section
    - _Requirements: 4.6, 6.7, 9.7_

- [x] 15. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The `PermissionLevel` type is NOT modified — Trainer is an `is_trainer` boolean flag on the users table
- The existing `requireRole` middleware is NOT modified — a new `requireTrainer` middleware is added alongside it
