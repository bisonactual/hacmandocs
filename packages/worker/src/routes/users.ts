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
 * GET / — List all users (Admin only).
 */
usersApp.get("/", requireRole("Admin"), async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(users);
  return c.json(rows);
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
