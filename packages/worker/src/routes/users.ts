import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import { users, permissionAuditLog } from "../db/schema";
import type { PermissionLevel } from "@hacmandocs/shared";

const VALID_LEVELS: PermissionLevel[] = ["Viewer", "Editor", "Approver", "Admin"];

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
 * GET / — List all users (Admin only).
 */
usersApp.get("/", requireRole("Admin"), async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(users);
  return c.json(rows);
});

/**
 * POST / — Create a new user (Admin only).
 * Accepts { name, email, username, permissionLevel }.
 */
usersApp.post("/", requireRole("Admin"), async (c) => {
  const body = await c.req.json<{
    name?: string;
    email?: string;
    username?: string;
    permissionLevel?: string;
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
 * PUT /:id/permission — Admin-only endpoint to change a user's permission level.
 * Validates the request body, updates D1, writes an audit log entry, and returns the updated user.
 */
usersApp.put("/:id/permission", requireRole("Admin"), async (c) => {
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

  const oldLevel = targetUser.permissionLevel;
  const now = Math.floor(Date.now() / 1000);
  const session = c.get("session");

  // 3. Update the user's permission level
  await db
    .update(users)
    .set({ permissionLevel: newLevel, updatedAt: now })
    .where(eq(users.id, targetId));

  // 4. Write audit log entry
  await db.insert(permissionAuditLog).values({
    id: crypto.randomUUID(),
    adminId: session.userId,
    targetUserId: targetId,
    oldLevel,
    newLevel,
    createdAt: now,
  });

  // 5. Return the updated user
  const [updatedUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  return c.json(updatedUser);
});

export default usersApp;
