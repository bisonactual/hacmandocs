# Implementation Plan: Manager Role Expansion

## Overview

This plan implements a dual-permission model by adding `groupLevel` to the users table and expanding Manager access across the admin panel, training portal, and user management. Implementation proceeds bottom-up: database → shared types → session → middleware → API routes → UI. Each layer builds on the previous, with property tests validating correctness at each stage.

## Tasks

- [x] 1. Database migration and schema updates
  - [x] 1.1 Create migration file `packages/worker/drizzle/0009_add_group_level.sql`
    - Add `group_level TEXT NOT NULL DEFAULT 'Member'` column to `users` table via `ALTER TABLE ADD COLUMN`
    - Create `group_level_audit_log` table with columns: id, acting_user_id, target_user_id, old_level, new_level, created_at
    - Migration must be non-destructive and additive — existing rows get "Member" automatically
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 6.1_

  - [x] 1.2 Update Drizzle schema in `packages/worker/src/db/schema.ts`
    - Add `groupLevel` field to the `users` table definition with `text("group_level").notNull().default("Member")`
    - Add `group_level_check` constraint: `IN ('Member', 'Non_Member', 'Team_Leader', 'Manager', 'Board_Member')`
    - Add new `groupLevelAuditLog` table definition with foreign keys to `users.id`
    - Export the new table
    - _Requirements: 1.3, 1.5, 6.1_

  - [x] 1.3 Update shared types in `packages/shared/src/types.ts`
    - Add `groupLevel: GroupLevel` field to the `User` interface (the `GroupLevel` type already exists)
    - _Requirements: 1.4_

- [x] 2. Session layer — include groupLevel and add session invalidation
  - [x] 2.1 Update `SessionData` and `createSession` in `packages/worker/src/auth/session.ts`
    - Add `groupLevel: GroupLevel` to `SessionData` interface (import `GroupLevel` from shared)
    - Add `groupLevel` parameter to `createSession` (default `"Member"`)
    - In `getSession`, apply fallback: if parsed JSON has no `groupLevel` field, default to `"Member"` for pre-migration sessions
    - _Requirements: 7.1, 7.4_

  - [x] 2.2 Implement session invalidation and reverse-lookup in `packages/worker/src/auth/session.ts`
    - On `createSession`: store/append token to `user-sessions:{userId}` KV key (JSON array of tokens) with same 24h TTL
    - On `deleteSession` (logout): remove the token from the `user-sessions:{userId}` list
    - Add `invalidateUserSessions(kv, userId)` function: read `user-sessions:{userId}`, delete each token from KV, then delete the reverse-lookup key
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8_

  - [x] 2.3 Update `createSession` call site in `packages/worker/src/auth/oauth.ts` and `packages/worker/src/auth/member.ts`
    - Pass the user's `groupLevel` value (from DB row) to `createSession`
    - _Requirements: 7.1_

  - [ ]* 2.4 Write property test for session groupLevel inclusion (Property 9)
    - **Property 9: Session includes groupLevel**
    - For any user with a stored groupLevel, the session SHALL include that exact value; if null/missing, defaults to "Member"
    - **Validates: Requirements 7.1, 7.4**

  - [ ]* 2.5 Write property test for session invalidation (Property 12)
    - **Property 12: Session invalidation on groupLevel or permissionLevel change**
    - For any user with active sessions, after invalidation all session tokens SHALL be deleted from KV
    - **Validates: Requirements 11.1, 11.2, 11.4**

- [x] 3. Middleware — requireAdminOrManager and training-portal updates
  - [x] 3.1 Add `requireAdminOrManager()` middleware to `packages/worker/src/middleware/rbac.ts`
    - Check `session.permissionLevel === "Admin" || session.groupLevel === "Manager"` — grant access if either is true, else 403
    - Export the new middleware function
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 3.2 Update `requireTrainer()` in `packages/worker/src/middleware/rbac.ts`
    - Add early-exit after the Admin check: `if (session.groupLevel === "Manager") { await next(); return; }`
    - _Requirements: 3.3, 7.3_

  - [x] 3.3 Update `requireToolAccess()` and `requireAreaAccess()` in `packages/worker/src/middleware/tool-access.ts`
    - Add early-exit after the Admin check in both functions: `if (session.groupLevel === "Manager") { await next(); return; }`
    - _Requirements: 3.1, 3.2, 7.2_

  - [ ]* 3.4 Write property test for requireAdminOrManager (Property 3)
    - **Property 3: Unauthorized callers are denied by requireAdminOrManager**
    - For any session where permissionLevel is not Admin AND groupLevel is not Manager, access SHALL be denied (403)
    - **Validates: Requirements 2.3, 4.3, 14.1–14.6**

  - [ ]* 3.5 Write property test for Manager/Admin training-portal bypass (Property 5)
    - **Property 5: Manager and Admin bypass training-portal middleware**
    - For any session where permissionLevel is Admin OR groupLevel is Manager, requireToolAccess/requireAreaAccess/requireTrainer SHALL grant access without DB lookups
    - **Validates: Requirements 3.1, 3.2, 3.4, 7.2, 7.3**

  - [ ]* 3.6 Write property test for non-privileged training-portal denial (Property 6)
    - **Property 6: Non-privileged users without assignments are denied training-portal access**
    - For any session where permissionLevel is not Admin AND groupLevel is not Manager AND no assignments exist, access SHALL be denied (403)
    - **Validates: Requirements 3.5**

  - [ ]* 3.7 Write property test for requireRole independence from groupLevel (Property 11)
    - **Property 11: Manager groupLevel does not bypass Admin-only endpoints**
    - For any session where permissionLevel is below Admin, requireRole("Admin") SHALL deny access regardless of groupLevel value
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. API routes — groupLevel endpoint and permission endpoint updates
  - [x] 5.1 Add `PUT /:id/group-level` endpoint to `packages/worker/src/routes/users.ts`
    - Guard with `requireAdminOrManager()`
    - Validate groupLevel value against the five valid values; return 400 if invalid
    - Look up target user; return 404 if not found
    - Enforce Manager boundary rules in handler (not middleware):
      - Manager cannot edit self → 403
      - Manager cannot set groupLevel to Manager or Board_Member → 403
      - Manager cannot edit users whose current groupLevel is Manager or Board_Member → 403
      - Manager cannot edit users whose permissionLevel is Admin → 403
      - Admins skip all boundary checks
    - Use D1 batch for atomicity: update `group_level` column AND insert `group_level_audit_log` row in same transaction
    - Call `invalidateUserSessions` for the target user after the batch
    - Return updated user
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 6.2, 6.3, 6.4, 11.1, 12.1, 12.2_

  - [x] 5.2 Update `PUT /:id/permission` endpoint in `packages/worker/src/routes/users.ts`
    - Change guard from `requireRole("Admin")` to `requireAdminOrManager()`
    - Add Manager boundary rules in handler:
      - Cannot set permissionLevel to Admin → 403
      - Cannot edit users whose current permissionLevel is Admin → 403
      - Cannot edit users whose current groupLevel is Board_Member → 403
      - Cannot edit users whose current groupLevel is Manager → 403
    - Wrap the update + audit log insert in a D1 batch for atomicity (fix existing non-atomic pattern)
    - Call `invalidateUserSessions` for the target user after the batch
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 11.2, 12.3, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 5.3 Relax `GET /` (user list) guard in `packages/worker/src/routes/users.ts`
    - Change from `requireRole("Admin")` to `requireAdminOrManager()`
    - _Requirements: 14.1_

  - [x] 5.4 Update create-user endpoint to include groupLevel in `packages/worker/src/routes/users.ts`
    - Accept optional `groupLevel` in POST body, default to "Member"
    - Validate the value; include it in the insert
    - Keep `requireRole("Admin")` guard — Managers cannot create users
    - _Requirements: 5.7, 8.2_

  - [ ]* 5.5 Write property test for GroupLevel validation (Property 1)
    - **Property 1: GroupLevel validation accepts only valid values**
    - For any string, the validation function SHALL accept it iff it is one of the five valid values
    - **Validates: Requirements 1.1, 1.3, 2.4**

  - [ ]* 5.6 Write property test for authorized groupLevel update (Property 2)
    - **Property 2: Authorized callers can update groupLevel**
    - For any Admin or Manager session (within boundary rules) and valid GroupLevel value, the update SHALL succeed
    - **Validates: Requirements 2.1, 2.2, 2.11**

  - [ ]* 5.7 Write property test for audit log completeness (Property 4)
    - **Property 4: Audit log completeness for groupLevel changes**
    - For any groupLevel change, the audit log entry SHALL contain acting user ID, target user ID, old level, new level, and timestamp > 0
    - **Validates: Requirements 2.6, 6.2, 6.3, 6.4**

  - [ ]* 5.8 Write property test for Manager groupLevel edit boundaries (Property 10)
    - **Property 10: Manager groupLevel edit boundary enforcement**
    - For any Manager session: self-edit denied, promote to Manager/Board_Member denied, edit Manager/Board_Member users denied, edit Admin users denied
    - **Validates: Requirements 2.7, 2.8, 2.9, 2.10**

  - [ ]* 5.9 Write property test for Manager permissionLevel edit boundaries (Property 13)
    - **Property 13: Manager permission-level edit boundary enforcement**
    - For any Manager session: can set Viewer/Editor/Approver for non-protected users; promote to Admin denied; edit Admin/Manager/Board_Member users denied
    - **Validates: Requirements 8.4, 8.5, 8.6, 8.7, 13.1–13.5**

- [x] 6. Backend route relaxation — categories, import, inductions
  - [x] 6.1 Relax category CRUD guards in `packages/worker/src/routes/categories.ts`
    - Change `requireRole("Admin")` to `requireAdminOrManager()` on POST, PUT, DELETE routes
    - Import `requireAdminOrManager` from rbac middleware
    - _Requirements: 14.2_

  - [x] 6.2 Relax import guards in `packages/worker/src/routes/import.ts`
    - Change `requireRole("Admin")` to `requireAdminOrManager()` on POST `/` and POST `/zip` routes
    - _Requirements: 14.3_

  - [x] 6.3 Relax induction tool CRUD guards in `packages/worker/src/routes/inductions.ts`
    - Change `requireRole("Admin")` to `requireAdminOrManager()` on POST/PUT/DELETE for tools
    - _Requirements: 14.4_

  - [x] 6.4 Relax induction quiz CRUD guards in `packages/worker/src/routes/inductions.ts`
    - Change `requireRole("Admin")` to `requireAdminOrManager()` on POST/PUT/DELETE for quizzes, publish, archive, questions CRUD, quiz import
    - _Requirements: 14.5_

  - [x] 6.5 Relax induction area CRUD and area leaders guards in `packages/worker/src/routes/inductions.ts`
    - Change `requireRole("Admin")` to `requireAdminOrManager()` on POST/DELETE for areas and PUT for area leaders
    - _Requirements: 14.6, 4.1, 4.2_

  - [x] 6.6 Update inline Admin checks in induction route handlers in `packages/worker/src/routes/inductions.ts`
    - `POST /trainer/tools/:toolId/mark-trained/:userId`: change `session.permissionLevel !== "Admin"` to also recognise `session.groupLevel === "Manager"`
    - `POST /signoff`: change `session.permissionLevel !== "Admin"` to also recognise `session.groupLevel === "Manager"`
    - `GET /trainer/my-tools`: change `session.permissionLevel === "Admin"` to also recognise `session.groupLevel === "Manager"` so Managers see all tools
    - _Requirements: 3.3, 3.6, 3.7_

  - [x] 6.7 Verify visibility group routes remain Admin-only in `packages/worker/src/routes/groups.ts`
    - Confirm all `/api/groups/*` routes still use `requireRole("Admin")` — no changes needed
    - Confirm user create (POST), delete (DELETE), and profile edit (PUT /:id) remain `requireRole("Admin")`
    - _Requirements: 14.7, 14.8_

  - [ ]* 6.8 Write property test for Manager inline Admin check bypass (Property 7)
    - **Property 7: Manager bypasses inline Admin checks in route handlers**
    - For any Manager session, the inline checks in mark-trained, signoff, and my-tools SHALL treat Manager equivalently to Admin
    - **Validates: Requirements 3.3, 3.6, 3.7**

  - [ ]* 6.9 Write property test for area leader replace-all semantics (Property 8)
    - **Property 8: Area leader replace-all semantics**
    - For any area and any list of user IDs, after the operation the set of area leaders SHALL equal exactly the provided list
    - **Validates: Requirements 4.4**

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Frontend — useAuth and AdminLayout updates
  - [x] 8.1 Update `AuthUser` interface and session hydration in `packages/web/src/hooks/useAuth.tsx`
    - Add `groupLevel: GroupLevel` to `AuthUser` interface (import `GroupLevel` from shared)
    - Parse `groupLevel` from the `/api/users/me` response (with `"Member"` fallback)
    - _Requirements: 7.1_

  - [x] 8.2 Update `AdminLayout.tsx` to admit Managers
    - Relax the guard: allow access if `user.permissionLevel === "Admin"` OR `user.groupLevel === "Manager"`
    - Conditionally show/hide "Visibility Groups" sidebar link (only for Admins)
    - Implement Manager route allowlist: `[users, categories, proposals, import, export, areas, tools, quizzes]` — redirect non-allowlisted `/admin/*` routes to `/admin/users` for Managers
    - The allowlist must also match sub-routes (e.g. `/admin/quizzes/:id/description`)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 9. Frontend — UsersPage dual-column management
  - [x] 9.1 Add groupLevel column and dropdown to `packages/web/src/pages/admin/UsersPage.tsx`
    - Add `groupLevel: GroupLevel` to `UserRow` interface
    - Add "Group Level" column header and `<select>` dropdown in the table
    - Add `changeGroupLevel` handler that calls `PUT /api/users/:id/group-level`
    - Add Group Level dropdown to the create-user form with default "Member"
    - Expand the reference section with Group Level descriptions
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 9.2 Implement Manager-specific restrictions on UsersPage
    - Use `useAuth()` to detect if current user is Manager (not Admin)
    - Hide "Create User" button and "Delete" buttons for Managers
    - Hide profile edit controls (name, email, username inline editing) for Managers
    - Disable both Permission and Group Level dropdowns for protected users (permissionLevel "Admin", groupLevel "Manager", or groupLevel "Board_Member")
    - Restrict Permission dropdown options to Viewer/Editor/Approver for Managers (no Admin option)
    - Restrict Group Level dropdown options to Member/Non_Member/Team_Leader for Managers (no Manager/Board_Member options)
    - _Requirements: 5.9, 5.10, 5.11, 5.12, 5.13_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Wire everything together and final integration
  - [x] 11.1 Update `packages/worker/src/index.ts` Env type if needed
    - Ensure the Hono `Env` type's session variable includes `groupLevel` so TypeScript is satisfied across all middleware and route files
    - _Requirements: 7.1_

  - [x] 11.2 Verify end-to-end flow: Manager admin panel access
    - Confirm AdminLayout, sidebar sections, route allowlist, and all relaxed backend routes work together for a Manager user
    - Confirm Managers can access Users, Categories, Proposals, Import, Export, Areas, Tools, Quizzes pages
    - Confirm Managers are redirected from `/admin/groups` to `/admin/users`
    - _Requirements: 9.1–9.10_

  - [x] 11.3 Verify end-to-end flow: Manager user management boundaries
    - Confirm Managers can change permissionLevel (Viewer/Editor/Approver) and groupLevel (Member/Non_Member/Team_Leader) for non-protected users
    - Confirm Managers cannot edit Admin, Manager, or Board_Member users
    - Confirm Managers cannot create or delete users
    - Confirm session invalidation fires on both groupLevel and permissionLevel changes
    - _Requirements: 2.7–2.10, 5.9–5.13, 8.4–8.7, 11.1–11.2, 13.1–13.5_

  - [ ]* 11.4 Write integration tests for Manager access flows
    - Test Manager accessing categories/import/tools/quizzes/areas endpoints → 200
    - Test Manager accessing visibility groups endpoint → 403
    - Test Manager creating/deleting users → 403
    - Test groupLevel change flow: update + audit log + session invalidation
    - Test permissionLevel change by Manager with boundary enforcement
    - _Requirements: 8.1–8.3, 14.1–14.8_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 13 correctness properties from the design document using vitest + fast-check
- All property tests go in `packages/worker/src/middleware/rbac-manager.property.test.ts` following the existing pattern in `rbac.property.test.ts`
- The migration is non-destructive — existing rows get `group_level = 'Member'` automatically
- Session invalidation fires on BOTH groupLevel AND permissionLevel changes
- Manager-to-Manager protection is consistent across both axes (groupLevel and permissionLevel)
