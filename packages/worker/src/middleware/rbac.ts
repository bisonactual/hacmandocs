import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { PermissionLevel } from "@hacmandocs/shared";
import type { Env } from "../index";
import { toolTrainers, areaLeaders } from "../db/schema";

/**
 * Numeric weight for each permission level.
 * Higher value = more privileges.
 */
const LEVEL_RANK: Record<PermissionLevel, number> = {
  Viewer: 0,
  Editor: 1,
  Approver: 2,
  Admin: 3,
};

/**
 * Returns Hono middleware that enforces a minimum permission level.
 *
 * The auth middleware must run first so that `c.get("session")` is available.
 * If the user's level is below `minLevel`, a 403 JSON response is returned.
 */
export function requireRole(minLevel: PermissionLevel) {
  return createMiddleware<Env>(async (c, next) => {
    const session = c.get("session");
    const userRank = LEVEL_RANK[session.permissionLevel];
    const requiredRank = LEVEL_RANK[minLevel];

    if (userRank < requiredRank) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }

    await next();
  });
}

/**
 * Returns Hono middleware that requires the user to be an Admin
 * (by permissionLevel) or a Manager (by groupLevel).
 *
 * Used for routes that should admit both Admins and Managers,
 * such as user listing, categories CRUD, import, tool/quiz/area CRUD, etc.
 */
export function requireAdminOrManager() {
  return createMiddleware<Env>(async (c, next) => {
    const session = c.get("session");
    if (session.permissionLevel === "Admin" || session.groupLevel === "Manager") {
      await next();
      return;
    }
    return c.json({ error: "Insufficient permissions" }, 403);
  });
}

/**
 * Returns Hono middleware that requires the user to be an Admin,
 * Manager, or Approver.
 *
 * Used for docs-management routes (categories CRUD, export, etc.)
 * where Approvers need access alongside Admins and Managers.
 */
export function requireDocsCurator() {
  return createMiddleware<Env>(async (c, next) => {
    const session = c.get("session");
    if (
      session.permissionLevel === "Admin" ||
      session.permissionLevel === "Approver" ||
      session.groupLevel === "Manager"
    ) {
      await next();
      return;
    }
    return c.json({ error: "Insufficient permissions" }, 403);
  });
}

/**
 * Returns Hono middleware that requires the user to be a trainer
 * (assigned to at least one tool via tool_trainers), an area leader,
 * or an Admin.
 *
 * Admins always pass the trainer check — they have implicit trainer access.
 * Managers (by groupLevel) also bypass the trainer check.
 */
export function requireTrainer() {
  return createMiddleware<Env>(async (c, next) => {
    const session = c.get("session");

    // Admins always pass
    if (session.permissionLevel === 'Admin') {
      await next();
      return;
    }

    // Managers always pass
    if (session.groupLevel === "Manager") {
      await next();
      return;
    }

    const db = drizzle(c.env.DB);

    // Check if user is assigned to any tool as a trainer
    const [trainerAssignment] = await db
      .select()
      .from(toolTrainers)
      .where(eq(toolTrainers.userId, session.userId))
      .limit(1);

    if (trainerAssignment) {
      await next();
      return;
    }

    // Check if user is an area leader
    const [leaderAssignment] = await db
      .select()
      .from(areaLeaders)
      .where(eq(areaLeaders.userId, session.userId))
      .limit(1);

    if (leaderAssignment) {
      await next();
      return;
    }

    return c.json({ error: "Insufficient permissions" }, 403);
  });
}
