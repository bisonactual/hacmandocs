import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole, requireAdminOrManager, requireDocsCurator } from "../middleware/rbac";
import { users } from "../db/schema";
import { invalidateUserSessions } from "../auth/session";
import type { GroupLevel, PermissionLevel } from "@hacmandocs/shared";

const VALID_LEVELS: PermissionLevel[] = ["Viewer", "Editor", "Approver", "Admin"];
const VALID_GROUP_LEVELS: GroupLevel[] = ["Member", "Non_Member", "Team_Leader", "Manager", "Board_Member"];

const usersApp = new Hono<Env>();

/**
 * GET /me — Get the current authenticated user's profile.
 */
usersApp.get("/me", async (c) => {
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(user);
});

/**
 * PUT /me/username — Set or update the current user's hackspace username.
 * Required on first login for all users.
 */
usersApp.put("/me/username", async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{ username?: string }>();

  if (!body.username || !body.username.trim()) {
    return c.json({ error: "Username is required." }, 400);
  }

  const trimmed = body.username.trim();
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  // Check uniqueness
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.username, trimmed))
    .limit(1);

  if (existing && existing.id !== session.userId) {
    return c.json({ error: "This username is already taken." }, 409);
  }

  await db
    .update(users)
    .set({ username: trimmed, updatedAt: now })
    .where(eq(users.id, session.userId));

  const [updatedUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return c.json(updatedUser);
});

/**
 * GET / — List all users (Admin, Manager, or Approver).
 */
usersApp.get("/", requireDocsCurator(), async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(users);
  return c.json(rows);
});

/**
 * POST / — Create a new user (Admin only).
 * Accepts { name, email, username, permissionLevel, groupLevel }.
 */
usersApp.post("/", requireRole("Admin"), async (c) => {
  const body = await c.req.json<{
    name?: string;
    email?: string;
    username?: string;
    permissionLevel?: string;
    groupLevel?: string;
  }>();

  if (!body.name || !body.name.trim()) {
    return c.json({ error: "Name is required." }, 400);
  }

  if (!body.username || !body.username.trim()) {
    return c.json({ error: "Username is required." }, 400);
  }

  const level = body.permissionLevel ?? "Viewer";
  if (!VALID_LEVELS.includes(level as PermissionLevel)) {
    return c.json({ error: "Invalid permission level." }, 400);
  }

  const groupLevel = body.groupLevel ?? "Member";
  if (!VALID_GROUP_LEVELS.includes(groupLevel as GroupLevel)) {
    return c.json(
      {
        error:
          "Invalid group level. Must be one of: Member, Non_Member, Team_Leader, Manager, Board_Member.",
      },
      400,
    );
  }

  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const trimmedUsername = body.username.trim();

  // Check username uniqueness
  const [existingUsername] = await db
    .select()
    .from(users)
    .where(eq(users.username, trimmedUsername))
    .limit(1);

  if (existingUsername) {
    return c.json({ error: "This username is already taken." }, 409);
  }

  const userId = crypto.randomUUID();

  await db.insert(users).values({
    id: userId,
    email: body.email?.trim() ?? "",
    name: body.name.trim(),
    username: trimmedUsername,
    authMethod: "member",
    externalId: trimmedUsername,
    permissionLevel: level,
    groupLevel: groupLevel,
    createdAt: now,
    updatedAt: now,
  });

  const [newUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return c.json(newUser, 201);
});

/**
 * PUT /:id/permission — Admin or Manager endpoint to change a user's permission level.
 * Validates the request body, enforces Manager boundary rules, updates D1 atomically
 * with an audit log entry, invalidates target sessions, and returns the updated user.
 */
usersApp.put("/:id/permission", requireAdminOrManager(), async (c) => {
  const targetId = c.req.param("id");
  const body = await c.req.json<{ permissionLevel?: string }>();

  // 1. Validate permissionLevel
  if (
    !body.permissionLevel ||
    !VALID_LEVELS.includes(body.permissionLevel as PermissionLevel)
  ) {
    return c.json(
      {
        error:
          "Invalid permission level. Must be one of: Viewer, Editor, Approver, Admin.",
      },
      400,
    );
  }

  const newLevel = body.permissionLevel as PermissionLevel;
  const db = drizzle(c.env.DB);

  // 2. Look up the target user
  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const session = c.get("session");

  // 3. Enforce Manager boundary rules
  if (session.permissionLevel !== "Admin" && session.groupLevel === "Manager") {
    if (newLevel === "Admin") {
      return c.json({ error: "Only Admins can promote to Admin." }, 403);
    }
    if (targetUser.permissionLevel === "Admin") {
      return c.json({ error: "Only Admins can change Admin users' permissions." }, 403);
    }
    if (targetUser.groupLevel === "Board_Member") {
      return c.json({ error: "Only Admins can change Board Member users' permissions." }, 403);
    }
    if (targetUser.groupLevel === "Manager") {
      return c.json({ error: "Only Admins can change Manager users' permissions." }, 403);
    }
  }

  const oldLevel = targetUser.permissionLevel;
  const now = Math.floor(Date.now() / 1000);
  const auditId = crypto.randomUUID();

  // 4. Atomic batch: update permission + write audit log
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET permission_level = ?, updated_at = ? WHERE id = ?",
    ).bind(newLevel, now, targetId),
    c.env.DB.prepare(
      "INSERT INTO permission_audit_log (id, admin_id, target_user_id, old_level, new_level, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(auditId, session.userId, targetId, oldLevel, newLevel, now),
  ]);

  // 5. Invalidate target user's sessions
  await invalidateUserSessions(c.env.SESSIONS, targetId);

  // 6. Return the updated user
  const [updatedUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  return c.json(updatedUser);
});

/**
 * PUT /:id/group-level — Admin or Manager endpoint to change a user's group level.
 * Validates the request body, enforces Manager boundary rules, updates D1 atomically
 * with an audit log entry, invalidates target sessions, and returns the updated user.
 */
usersApp.put("/:id/group-level", requireAdminOrManager(), async (c) => {
  const targetId = c.req.param("id");
  const body = await c.req.json<{ groupLevel?: string }>();

  // 1. Validate groupLevel
  if (
    !body.groupLevel ||
    !VALID_GROUP_LEVELS.includes(body.groupLevel as GroupLevel)
  ) {
    return c.json(
      {
        error:
          "Invalid group level. Must be one of: Member, Non_Member, Team_Leader, Manager, Board_Member.",
      },
      400,
    );
  }

  const newLevel = body.groupLevel as GroupLevel;
  const db = drizzle(c.env.DB);

  // 2. Look up the target user
  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const session = c.get("session");

  // 3. Enforce Manager boundary rules (Admins skip all checks)
  if (session.permissionLevel !== "Admin" && session.groupLevel === "Manager") {
    if (targetId === session.userId) {
      return c.json({ error: "Managers cannot change their own group level." }, 403);
    }
    if (newLevel === "Manager" || newLevel === "Board_Member") {
      return c.json({ error: "Only Admins can promote to Manager or Board_Member." }, 403);
    }
    if (targetUser.groupLevel === "Manager" || targetUser.groupLevel === "Board_Member") {
      return c.json({ error: "Only Admins can change the group level of Managers or Board Members." }, 403);
    }
    if (targetUser.permissionLevel === "Admin") {
      return c.json({ error: "Only Admins can change the group level of Admin users." }, 403);
    }
  }

  const oldLevel = targetUser.groupLevel;
  const now = Math.floor(Date.now() / 1000);
  const auditId = crypto.randomUUID();

  // 4. Atomic batch: update group_level + write audit log
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET group_level = ?, updated_at = ? WHERE id = ?",
    ).bind(newLevel, now, targetId),
    c.env.DB.prepare(
      "INSERT INTO group_level_audit_log (id, acting_user_id, target_user_id, old_level, new_level, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(auditId, session.userId, targetId, oldLevel, newLevel, now),
  ]);

  // 5. Invalidate target user's sessions
  await invalidateUserSessions(c.env.SESSIONS, targetId);

  // 6. Return the updated user
  const [updatedUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  return c.json(updatedUser);
});

/**
 * PUT /:id — Admin-only endpoint to edit a user's name, email, or username.
 */
usersApp.put("/:id", requireRole("Admin"), async (c) => {
  const targetId = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    email?: string;
    username?: string;
  }>();

  const db = drizzle(c.env.DB);

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const updates: Record<string, unknown> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };

  if (body.name !== undefined) {
    if (!body.name.trim()) return c.json({ error: "Name cannot be empty." }, 400);
    updates.name = body.name.trim();
  }

  if (body.email !== undefined) {
    updates.email = body.email.trim();
  }

  if (body.username !== undefined) {
    if (!body.username.trim()) return c.json({ error: "Username cannot be empty." }, 400);
    const trimmed = body.username.trim();
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.username, trimmed))
      .limit(1);
    if (existing && existing.id !== targetId) {
      return c.json({ error: "This username is already taken." }, 409);
    }
    updates.username = trimmed;
  }

  await db.update(users).set(updates).where(eq(users.id, targetId));

  const [updatedUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  return c.json(updatedUser);
});

/**
 * DELETE /:id — Admin-only endpoint to delete a user.
 * Prevents self-deletion.
 */
usersApp.delete("/:id", requireRole("Admin"), async (c) => {
  const targetId = c.req.param("id");
  const session = c.get("session");

  if (targetId === session.userId) {
    return c.json({ error: "You cannot delete your own account." }, 400);
  }

  const db = drizzle(c.env.DB);

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  await db.delete(users).where(eq(users.id, targetId));

  return c.json({ success: true });
});

export default usersApp;
