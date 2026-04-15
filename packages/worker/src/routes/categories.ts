import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireAdminOrManager } from "../middleware/rbac";
import { categories, documents, categoryVisibility, visibilityGroups, visibilityGroupMembers } from "../db/schema";

const GROUP_LEVEL_RANK: Record<string, number> = {
  Non_Member: 0,
  Member: 1,
  Team_Leader: 2,
  Manager: 3,
  Board_Member: 4,
};

const categoriesApp = new Hono<Env>();

/**
 * GET / — List all categories (Viewer+).
 * Returns all categories with parent_id so the frontend can build the tree.
 * Includes `isPrivate` flag for categories that have visibility group assignments.
 * Filters out private categories for users without access.
 */
categoriesApp.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const session = c.get("session") as import("../auth/session").SessionData | undefined;

  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
      createdAt: categories.createdAt,
    })
    .from(categories);
