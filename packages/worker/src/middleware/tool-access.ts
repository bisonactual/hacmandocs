import { createMiddleware } from "hono/factory";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { toolRecords, toolTrainers, areaLeaders } from "../db/schema";

/**
 * Middleware that checks if the current user has access to a specific tool.
 * Access is granted if the user is:
 * - An Admin (always)
 * - An area leader for the tool's area
 * - A trainer assigned to that specific tool
 *
 * Expects the tool ID in the route param specified by `paramName`.
 */
export function requireToolAccess(paramName: string = "toolId") {
  return createMiddleware<Env>(async (c, next) => {
    const session = c.get("session");

    // Admins always pass
    if (session.permissionLevel === "Admin") {
      await next();
      return;
    }

    const toolId = c.req.param(paramName);
    if (!toolId) {
      return c.json({ error: "Tool ID is required." }, 400);
    }

    const db = drizzle(c.env.DB);

    // Check if user is an area leader for this tool's area
    const [tool] = await db
      .select({ areaId: toolRecords.areaId })
      .from(toolRecords)
      .where(eq(toolRecords.id, toolId))
      .limit(1);

    if (!tool) {
      return c.json({ error: "Tool record not found." }, 404);
    }

    if (tool.areaId) {
      const [leader] = await db
        .select()
        .from(areaLeaders)
        .where(
          and(
            eq(areaLeaders.userId, session.userId),
            eq(areaLeaders.areaId, tool.areaId),
          ),
        )
        .limit(1);

      if (leader) {
        await next();
        return;
      }
    }

    // Check if user is a trainer assigned to this tool
    const [assignment] = await db
      .select()
      .from(toolTrainers)
      .where(
        and(
          eq(toolTrainers.userId, session.userId),
          eq(toolTrainers.toolRecordId, toolId),
        ),
      )
      .limit(1);

    if (assignment) {
      await next();
      return;
    }

    return c.json({ error: "Insufficient permissions for this tool." }, 403);
  });
}

/**
 * Middleware that checks if the user can admin an area.
 * Access is granted if the user is:
 * - An Admin (always)
 * - An area leader for the specified area
 */
export function requireAreaAccess(paramName: string = "areaId") {
  return createMiddleware<Env>(async (c, next) => {
    const session = c.get("session");

    if (session.permissionLevel === "Admin") {
      await next();
      return;
    }

    const areaId = c.req.param(paramName);
    if (!areaId) {
      return c.json({ error: "Area ID is required." }, 400);
    }

    const db = drizzle(c.env.DB);

    const [leader] = await db
      .select()
      .from(areaLeaders)
      .where(
        and(
          eq(areaLeaders.userId, session.userId),
          eq(areaLeaders.areaId, areaId),
        ),
      )
      .limit(1);

    if (leader) {
      await next();
      return;
    }

    return c.json({ error: "Insufficient permissions for this area." }, 403);
  });
}
