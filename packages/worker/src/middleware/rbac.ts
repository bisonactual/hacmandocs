import { createMiddleware } from "hono/factory";
import type { PermissionLevel } from "@hacmandocs/shared";
import type { Env } from "../index";

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
