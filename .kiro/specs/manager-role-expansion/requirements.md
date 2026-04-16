# Requirements Document

## Introduction

This feature introduces a dual-permission model for users. The existing `permissionLevel` column (Viewer, Editor, Approver, Admin) controls RBAC for document and system operations. A new `groupLevel` column is added to the `users` table with values Member, Non_Member, Team_Leader, Manager, and Board_Member. This second column controls organisational role — determining training-portal access, area-leader management privileges, and `groupLevel` promotion/demotion capabilities.

Note: `groupLevel` does NOT affect document visibility. Visibility is driven by explicit group membership records, not by `groupLevel`. The Team_Leader and Board_Member values are organisational labels only — this feature does not introduce any new behaviour for those values beyond storing them.

The two columns are independent: an Admin can set both `permissionLevel` and `groupLevel` for any user. A Manager (groupLevel) gains broad admin-panel access — including Users (with restrictions), Categories, Proposals, Import, Export, and the full Training Portal — without requiring Admin-level `permissionLevel`. The only admin section hidden from Managers is Visibility Groups.

Managers can manage users' `permissionLevel` (except cannot set Admin) and `groupLevel` (except cannot set Manager or Board_Member) via the Users page dropdowns. Managers CANNOT edit user profiles (name, email, username) — the `PUT /api/users/:id` endpoint remains Admin-only. Managers cannot create or delete users, and cannot edit users who are Admins (by permissionLevel), Managers (by groupLevel), or Board_Members (by groupLevel).

The admin Users page displays both columns side by side so that Admins and Managers can manage them (within their respective boundaries). All `groupLevel` changes are audit-logged. All `permissionLevel` changes made by Managers are also audit-logged.

## Glossary

- **RBAC_System**: The role-based access control layer that enforces `permissionLevel` checks on API routes via the `requireRole()` middleware.
- **Permission_Level**: The hierarchical user role stored in the `permission_level` column on the `users` table. Values: Viewer, Editor, Approver, Admin. Unchanged by this feature.
- **Group_Level**: A new column on the `users` table representing the user's organisational role. Values: Member, Non_Member, Team_Leader, Manager, Board_Member. Defaults to Member for existing users.
- **Manager**: A `groupLevel` value indicating a user with elevated admin-panel access including Users (restricted), Categories, Proposals, Import, Export, and full Training Portal access.
- **Admin**: The highest `permissionLevel`, retaining all existing capabilities including full user management, visibility group control, and training-portal access.
- **Training_Portal**: The induction system comprising tool records, quizzes, certifications, tool areas, area leaders, and tool trainers.
- **Area_Leader**: A user assigned to lead a specific tool area via the `areaLeaders` table, granting them access to tools and trainer management within that area.
- **Tool_Access_Middleware**: The `requireToolAccess()` and `requireAreaAccess()` middleware functions that gate access to tool and area operations.
- **Trainer_Middleware**: The `requireTrainer()` middleware that gates access to trainer-scoped routes.
- **Users_Page**: The admin UI page at `/admin/users` that displays and manages user accounts.
- **Group_Level_Audit_Log**: An audit log table recording all changes to a user's `groupLevel`, including who made the change, the old value, and the new value.
- **Inline_Admin_Check**: A hard-coded `session.permissionLevel === "Admin"` or `!== "Admin"` check inside a route handler body (as opposed to middleware). These must be updated alongside middleware to recognise Manager access.
- **Session_Invalidation**: The process of deleting or refreshing a user's active KV-backed session entries when their `groupLevel` changes, ensuring the new value takes effect immediately.

## Requirements

### Requirement 1: Add groupLevel Column to Users Table

**User Story:** As a system administrator, I want each user to have a `groupLevel` field alongside their existing `permissionLevel`, so that organisational roles and system permissions can be managed independently.

#### Acceptance Criteria

1. THE RBAC_System SHALL store a `group_level` column on the `users` table with allowed values: Member, Non_Member, Team_Leader, Manager, Board_Member.
2. THE RBAC_System SHALL default the `group_level` column to "Member" so that existing user rows are unaffected by the migration.
3. THE RBAC_System SHALL enforce a database check constraint ensuring `group_level` contains only the five valid values.
4. THE RBAC_System SHALL include "GroupLevel" in the shared `types.ts` type definitions (this type already exists and is unchanged).
5. THE RBAC_System SHALL add the `groupLevel` field to the Drizzle schema definition for the `users` table.
6. THE RBAC_System SHALL use a non-destructive, additive migration (ALTER TABLE ADD COLUMN) to add the `group_level` column.

### Requirement 2: API Endpoint for Changing a User's groupLevel

**User Story:** As an Admin or Manager, I want to change a user's `groupLevel` via an API endpoint, so that organisational roles can be assigned and updated.

#### Acceptance Criteria

1. WHEN an Admin sends a PUT request to the group-level update endpoint with a valid Group_Level value, THE RBAC_System SHALL update the target user's `group_level` column and return the updated user.
2. WHEN a user with Group_Level "Manager" sends a PUT request to the group-level update endpoint with a valid Group_Level value, THE RBAC_System SHALL update the target user's `group_level` column and return the updated user, subject to the boundary rules below.
3. WHEN a user who is neither an Admin (by Permission_Level) nor a Manager (by Group_Level) sends a PUT request to the group-level update endpoint, THE RBAC_System SHALL return a 403 forbidden response.
4. WHEN the request body contains an invalid Group_Level value, THE RBAC_System SHALL return a 400 bad-request response listing the valid values.
5. IF the target user does not exist, THEN THE RBAC_System SHALL return a 404 not-found response.
6. WHEN a Group_Level change occurs, THE RBAC_System SHALL record the change in the Group_Level_Audit_Log with the acting user's ID, the target user's ID, the old Group_Level, the new Group_Level, and a timestamp.
7. WHEN a Manager attempts to change their own Group_Level, THE RBAC_System SHALL return a 403 forbidden response (Managers cannot modify their own organisational role).
8. WHEN a Manager attempts to set a target user's Group_Level to "Manager" or "Board_Member", THE RBAC_System SHALL return a 403 forbidden response (only Admins can promote to Manager or Board_Member).
9. WHEN a Manager attempts to change the Group_Level of a target user whose current Group_Level is "Manager" or "Board_Member", THE RBAC_System SHALL return a 403 forbidden response (Managers cannot demote peers or superiors).
10. WHEN a Manager attempts to change the Group_Level of a target user whose Permission_Level is "Admin", THE RBAC_System SHALL return a 403 forbidden response (Managers cannot modify Admin users' organisational role).
11. WHEN an Admin sends a PUT request to the group-level update endpoint, THE RBAC_System SHALL apply no boundary restrictions — Admins can set any valid Group_Level for any user including themselves.

### Requirement 3: Managers Have Full Training Portal Access

**User Story:** As a Manager (groupLevel), I want to access all tool areas in the training portal without being assigned as an area leader or trainer, so that I can oversee the entire training system.

#### Acceptance Criteria

1. WHEN a user with Group_Level "Manager" accesses a tool-access-protected route, THE Tool_Access_Middleware SHALL grant access regardless of area leader or trainer assignments.
2. WHEN a user with Group_Level "Manager" accesses an area-access-protected route, THE Tool_Access_Middleware SHALL grant access regardless of area leader assignments.
3. WHEN a user with Group_Level "Manager" requests the trainer tool list (`GET /trainer/my-tools`), THE Trainer_Middleware SHALL grant access and THE Training_Portal SHALL return all tool records (the inline Admin check in the handler body SHALL also recognise Manager).
4. WHEN an Admin (by Permission_Level) accesses any training-portal route, THE Training_Portal SHALL continue to grant access as before.
5. WHEN a user who is neither an Admin (by Permission_Level) nor a Manager (by Group_Level) accesses a tool-access-protected route without appropriate assignments, THE Tool_Access_Middleware SHALL return a 403 forbidden response.
6. WHEN a user with Group_Level "Manager" submits a manual certification (`POST /trainer/tools/:toolId/mark-trained/:userId`), THE Training_Portal SHALL grant access — the inline Admin check in the handler body SHALL recognise Manager alongside Admin.
7. WHEN a user with Group_Level "Manager" submits an induction signoff (`POST /signoff`), THE Training_Portal SHALL grant access — the inline Admin check in the handler body SHALL recognise Manager alongside Admin.

### Requirement 4: Managers Can Assign Area Leaders

**User Story:** As a Manager (groupLevel), I want to assign and remove area leaders for any tool area, so that I can delegate area-level responsibilities without needing an Admin.

#### Acceptance Criteria

1. WHEN a user with Group_Level "Manager" sends a PUT request to the area leaders endpoint, THE Training_Portal SHALL accept the request and update the area leaders for the specified area.
2. WHEN an Admin sends a PUT request to the area leaders endpoint, THE Training_Portal SHALL continue to accept the request as before.
3. WHEN a user who is neither an Admin (by Permission_Level) nor a Manager (by Group_Level) sends a PUT request to the area leaders endpoint, THE Training_Portal SHALL return a 403 forbidden response.
4. WHEN a Manager or Admin assigns area leaders, THE Training_Portal SHALL replace all current leaders for the specified area with the provided user list.
5. IF the specified area does not exist, THEN THE Training_Portal SHALL return a 404 not-found response.

### Requirement 5: Admin UI Displays Both Permission Columns

**User Story:** As an Admin or Manager, I want the Users page to show both `permissionLevel` and `groupLevel` columns, so that I can view and manage both independently for each user (within my allowed boundaries).

#### Acceptance Criteria

1. THE Users_Page SHALL display a "Permission" column showing the user's current Permission_Level value.
2. THE Users_Page SHALL display a "Group Level" column showing the user's current Group_Level value.
3. THE Users_Page SHALL provide a dropdown selector for Permission_Level with options: Viewer, Editor, Approver, Admin.
4. THE Users_Page SHALL provide a dropdown selector for Group_Level with options: Member, Non_Member, Team_Leader, Manager, Board_Member.
5. WHEN an Admin changes a user's Permission_Level via the dropdown, THE Users_Page SHALL send a PUT request to the permission update endpoint and reflect the change in the table.
6. WHEN an Admin changes a user's Group_Level via the dropdown, THE Users_Page SHALL send a PUT request to the group-level update endpoint and reflect the change in the table.
7. THE Users_Page SHALL include the Group_Level field in the create-user form with a default value of "Member".
8. THE Users_Page SHALL display a reference section explaining both Permission_Level and Group_Level values and their meanings.
9. WHEN a Manager views the Users_Page, THE Users_Page SHALL hide the "Create User" and "Delete" controls (Managers cannot create or delete users).
10. A user is PROTECTED from Manager edits if ANY of the following are true: their Permission_Level is "Admin", their Group_Level is "Manager", or their Group_Level is "Board_Member". WHEN a Manager views the Users_Page, THE Users_Page SHALL disable both the Permission_Level and Group_Level dropdowns for all protected users.
11. WHEN a Manager changes a non-protected user's Permission_Level via the dropdown, THE Users_Page SHALL restrict the options to Viewer, Editor, and Approver (the "Admin" option SHALL NOT be available to Managers).
12. WHEN a Manager changes a non-protected user's Group_Level via the dropdown, THE Users_Page SHALL restrict the options to Member, Non_Member, and Team_Leader (the "Manager" and "Board_Member" options SHALL NOT be available to Managers).
13. WHEN a Manager views the Users_Page, THE Users_Page SHALL NOT show profile edit controls (name, email, username) — profile editing remains Admin-only.

### Requirement 6: Audit Logging for groupLevel Changes

**User Story:** As a system administrator, I want all `groupLevel` changes to be recorded in an audit log, so that I can track who changed organisational roles and when.

#### Acceptance Criteria

1. THE RBAC_System SHALL maintain a `group_level_audit_log` table with columns: id, acting_user_id, target_user_id, old_level, new_level, created_at.
2. WHEN a Group_Level change is persisted, THE RBAC_System SHALL insert a row into the Group_Level_Audit_Log before returning the API response.
3. THE RBAC_System SHALL record the acting user's ID (the Admin or Manager who initiated the change) in the `acting_user_id` column.
4. THE RBAC_System SHALL record both the previous and new Group_Level values in the audit log entry.

### Requirement 7: Middleware Reads groupLevel from Session

**User Story:** As a developer, I want the authentication middleware to include the user's `groupLevel` in the session object, so that downstream middleware can check organisational role without additional database queries.

#### Acceptance Criteria

1. WHEN a user authenticates, THE RBAC_System SHALL include the user's `groupLevel` value in the session object alongside `permissionLevel`.
2. THE Tool_Access_Middleware SHALL read `groupLevel` from the session object to determine Manager access.
3. THE Trainer_Middleware SHALL read `groupLevel` from the session object to determine Manager access.
4. WHEN a user has no `groupLevel` value (null from pre-migration sessions), THE RBAC_System SHALL treat the user as having Group_Level "Member".

### Requirement 8: Manager Access Boundaries

**User Story:** As a system administrator, I want Managers (groupLevel) to have broad admin-panel access but with specific restrictions, so that they can manage most operations while protecting critical Admin-only functions.

#### Acceptance Criteria

1. WHEN a user whose only elevated privilege is Group_Level "Manager" (and whose Permission_Level is below Admin) attempts to access visibility group management endpoints, THE RBAC_System SHALL return a 403 forbidden response.
2. WHEN a user with Group_Level "Manager" attempts to create a new user via `POST /api/users`, THE RBAC_System SHALL return a 403 forbidden response (only Admins can create users).
3. WHEN a user with Group_Level "Manager" attempts to delete a user via `DELETE /api/users/:id`, THE RBAC_System SHALL return a 403 forbidden response (only Admins can delete users).
4. WHEN a user with Group_Level "Manager" attempts to set a user's Permission_Level to "Admin" via the permission update endpoint, THE RBAC_System SHALL return a 403 forbidden response.
5. WHEN a user with Group_Level "Manager" attempts to change the Permission_Level of a user whose current Permission_Level is "Admin", THE RBAC_System SHALL return a 403 forbidden response (Managers cannot edit Admin users' permissions).
6. WHEN a user with Group_Level "Manager" attempts to change the Permission_Level or Group_Level of a user whose current Group_Level is "Board_Member", THE RBAC_System SHALL return a 403 forbidden response (Managers cannot edit Board_Member users' permissions).
7. WHEN a user with Group_Level "Manager" attempts to change the Permission_Level of a user whose current Group_Level is "Manager", THE RBAC_System SHALL return a 403 forbidden response (Managers cannot edit other Managers' permissions).
8. THE RBAC_System SHALL allow a user who is both an Admin (by Permission_Level) and a Manager (by Group_Level) to access all endpoints without restriction.

### Requirement 9: Manager Admin Panel Access

**User Story:** As a Manager (groupLevel), I want to access the admin panel with visibility into Users, Categories, Proposals, Import, Export, and the full Training Portal, so that I can perform my management duties without needing Admin `permissionLevel`.

#### Acceptance Criteria

1. THE AdminLayout component SHALL allow users with Group_Level "Manager" to access the admin panel even when their Permission_Level is below Admin.
2. THE AdminLayout sidebar SHALL show Managers the following sections: Users, Categories, Proposals, Import, Export, Areas, Tools, and Quizzes.
3. THE AdminLayout sidebar SHALL hide the "Visibility Groups" link from Managers who are not also Admins.
4. WHEN a Manager navigates directly to `/admin/groups` (e.g. via URL bar), THE AdminLayout SHALL redirect them to `/admin/users`. More broadly, THE AdminLayout SHALL implement a systematic route allowlist: Manager-valid routes are [users, categories, proposals, import, export, areas, tools, quizzes, quizzes/:id/description]. Any `/admin/*` route not in the Manager allowlist SHALL redirect to `/admin/users`.
5. WHEN a Manager accesses the Users page, THE Users_Page SHALL fetch the user list from `GET /api/users` (relaxed to admit Managers) and display it with the restrictions defined in Requirement 5.
6. WHEN a Manager accesses the Categories page, THE system SHALL grant full CRUD access (create, read, update, delete categories).
7. WHEN a Manager accesses the Proposals page, THE system SHALL display the proposals management view. Note: the Proposals page is for visibility only — approve/reject actions are gated by Permission_Level (Approver+). Managers with lower Permission_Level simply see the list. No Group_Level-based bypass of approve/reject is introduced.
8. WHEN a Manager accesses the Import page, THE system SHALL grant full import access.
9. WHEN a Manager accesses the Export page, THE system SHALL display the Export page in the sidebar and grant page access. Note: actual export operations are gated by Permission_Level (Editor+). Managers whose Permission_Level is below Editor can see the page but cannot perform exports. No Group_Level-based bypass of export operations is introduced.
10. WHEN a Manager accesses the Training Portal pages (Areas, Tools, Quizzes), THE system SHALL grant full CRUD access — Managers can create, edit, delete, and manage all training portal entities.

### Requirement 10: Managers Can Manage Trainers

**User Story:** As a Manager (groupLevel), I want to assign and remove trainers for any tool, so that I can manage the training system without needing Admin `permissionLevel`.

#### Acceptance Criteria

1. WHEN a user with Group_Level "Manager" sends a PUT request to `PUT /tools/:id/trainers`, THE Training_Portal SHALL accept the request and update the trainers for the specified tool.
2. THE Manager's trainer management access SHALL be intentional — Managers bypass `requireToolAccess` and can manage trainers for any tool regardless of area assignment.
3. WHEN a Manager opens the trainer assignment dialog on the Tools page, THE system SHALL fetch the user list from `GET /api/users` (relaxed to admit Managers) to populate the trainer selection checkboxes.

### Requirement 11: Session Invalidation on groupLevel or permissionLevel Change

**User Story:** As a system administrator, I want a user's active sessions to be invalidated when their `groupLevel` or `permissionLevel` changes, so that promotions and demotions take effect immediately without waiting for session expiry or re-login.

#### Acceptance Criteria

1. WHEN a user's Group_Level is changed via the group-level update endpoint, THE RBAC_System SHALL invalidate all active KV-backed sessions for the target user.
2. WHEN a user's Permission_Level is changed via the permission update endpoint, THE RBAC_System SHALL invalidate all active KV-backed sessions for the target user.
3. THE Session_Invalidation SHALL occur as part of the same request that persists the change, before the API response is returned.
4. WHEN a demoted user's sessions are invalidated, THE RBAC_System SHALL force the user to re-authenticate, at which point the new values will be included in the fresh session.
5. THE RBAC_System SHALL store a reverse-lookup key in KV (mapping user ID to session tokens) so that all sessions for a given user can be found and deleted efficiently.
6. THE reverse-lookup key (`user-sessions:{userId}`) SHALL use the same TTL as sessions (24 hours) so it auto-cleans.
7. WHEN a user logs out, THE RBAC_System SHALL remove the token from the reverse-lookup list.
8. WHEN sessions are invalidated, THE RBAC_System SHALL delete all tokens from the reverse-lookup list and clear the list.

### Requirement 12: Audit Log Atomicity

**User Story:** As a system administrator, I want audit log writes to be reliable, so that I can trust the audit trail is complete.

#### Acceptance Criteria

1. WHEN a Group_Level change is persisted, THE RBAC_System SHALL write the audit log entry in the same database transaction as the `group_level` column update, so that both succeed or both fail together.
2. IF the audit log insert fails, THEN THE RBAC_System SHALL roll back the Group_Level change and return a 500 error to the caller.
3. THE RBAC_System SHALL apply the same transactional pattern to the existing `permissionAuditLog` writes (known limitation: the current update-then-log pattern can drift if the log insert fails).

### Requirement 13: Manager Permission-Level Change Access

**User Story:** As a Manager (groupLevel), I want to change users' `permissionLevel` (within boundaries), so that I can manage user access levels without needing an Admin.

#### Acceptance Criteria

1. WHEN a user with Group_Level "Manager" sends a PUT request to `PUT /api/users/:id/permission` with a valid Permission_Level value (Viewer, Editor, or Approver), THE RBAC_System SHALL update the target user's `permission_level` column and return the updated user.
2. WHEN a Manager attempts to set a user's Permission_Level to "Admin", THE RBAC_System SHALL return a 403 forbidden response.
3. WHEN a Manager attempts to change the Permission_Level of a user whose current Permission_Level is "Admin", THE RBAC_System SHALL return a 403 forbidden response.
4. WHEN a Manager attempts to change the Permission_Level of a user whose current Group_Level is "Board_Member", THE RBAC_System SHALL return a 403 forbidden response.
5. WHEN a Manager attempts to change the Permission_Level of a user whose current Group_Level is "Manager", THE RBAC_System SHALL return a 403 forbidden response (Managers cannot edit another Manager's permissions).
6. THE `PUT /api/users/:id/permission` endpoint SHALL be relaxed from `requireRole("Admin")` to `requireAdminOrManager()` to admit Managers.

### Requirement 14: Backend Route Relaxation for Manager Access

**User Story:** As a developer, I want the backend routes for categories, import, export, tool CRUD, quiz CRUD, and user listing to admit Managers, so that the Manager admin-panel access works end-to-end.

#### Acceptance Criteria

1. THE `GET /api/users` endpoint SHALL be relaxed from `requireRole("Admin")` to `requireAdminOrManager()` so that Managers can view the user list.
2. THE `POST /api/categories`, `PUT /api/categories/:id`, and `DELETE /api/categories/:id` endpoints SHALL be relaxed from `requireRole("Admin")` to `requireAdminOrManager()` so that Managers have full category CRUD.
3. THE `POST /api/import` and `POST /api/import/zip` endpoints SHALL be relaxed from `requireRole("Admin")` to `requireAdminOrManager()` so that Managers can import content.
4. THE tool CRUD endpoints (`POST /tools`, `PUT /tools/:id`, `DELETE /tools/:id`) in the inductions routes SHALL be relaxed from `requireRole("Admin")` to `requireAdminOrManager()` so that Managers have full tool management.
5. THE quiz CRUD endpoints (`POST /quizzes`, `PUT /quizzes/:id`, `POST /quizzes/:id/publish`, `POST /quizzes/:id/archive`, quiz question CRUD, `POST /quizzes/import`) in the inductions routes SHALL be relaxed from `requireRole("Admin")` to `requireAdminOrManager()` so that Managers have full quiz management.
6. THE area CRUD endpoints (`POST /areas`, `DELETE /areas/:id`) in the inductions routes SHALL be relaxed from `requireRole("Admin")` to `requireAdminOrManager()` so that Managers have full area management.
7. THE visibility group endpoints (`/api/groups/*`) SHALL remain `requireRole("Admin")` only — Managers SHALL NOT have access.
8. THE user create (`POST /api/users`), delete (`DELETE /api/users/:id`), and profile edit (`PUT /api/users/:id`) endpoints SHALL remain `requireRole("Admin")` only — Managers SHALL NOT have access.
