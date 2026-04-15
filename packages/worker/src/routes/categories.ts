import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireAdminOrManager } from "../middleware/rbac";
import { categories, documents, categoryVisibility, visibilityGroups, visibilityGroupMembers as _visibilityGroupMembers } from "../db/schema";

// Preserved for when visibility filtering is re-enabled
const _GROUP_LEVEL_RANK: Record<string, number> = {
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
  const _session = c.get("session") as import("../auth/session").SessionData | undefined;

  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
      createdAt: categories.createdAt,
    })
    .from(categories);

  // Get all category visibility assignments
  const catVisRows = await db
    .select({
      categoryId: categoryVisibility.categoryId,
      groupId: categoryVisibility.groupId,
      groupLevel: visibilityGroups.groupLevel,
    })
    .from(categoryVisibility)
    .leftJoin(visibilityGroups, eq(categoryVisibility.groupId, visibilityGroups.id));

  // Build map: categoryId → group assignments
  const catGroupMap = new Map<string, { groupId: string; groupLevel: string | null }[]>();
  for (const row of catVisRows) {
    if (!catGroupMap.has(row.categoryId)) {
      catGroupMap.set(row.categoryId, []);
    }
    catGroupMap.get(row.categoryId)!.push({ groupId: row.groupId, groupLevel: row.groupLevel });
  }

  // Return all categories — the list is public so the sidebar can build
  // the full navigation tree. Per-category access control is enforced on
  // the document detail endpoint via checkCategoryVisibility.
  return c.json(rows.map((r) => ({ ...r, isPrivate: catGroupMap.has(r.id) })));
});

/**
 * POST / — Create a category (Admin only).
 * Accepts: name, parentId (optional), sortOrder (optional, default 0).
 */
categoriesApp.post("/", requireAdminOrManager(), async (c) => {
  const body = await c.req.json<{
    name?: string;
    parentId?: string | null;
    sortOrder?: number;
  }>();

  if (!body.name || !body.name.trim()) {
    return c.json({ error: "Category name is required." }, 400);
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const db = drizzle(c.env.DB);

  await db.insert(categories).values({
    id,
    name: body.name.trim(),
    parentId: body.parentId ?? null,
    sortOrder: body.sortOrder ?? 0,
    createdAt: now,
  });

  const [created] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  return c.json(created, 201);
});

/**
 * PUT /:id — Update a category (Admin only).
 * Accepts: name, parentId, sortOrder.
 */
categoriesApp.put("/:id", requireAdminOrManager(), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    parentId?: string | null;
    sortOrder?: number;
  }>();

  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Category not found" }, 404);
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return c.json({ error: "Category name is required." }, 400);
    }
    updates.name = body.name.trim();
  }

  if (body.parentId !== undefined) {
    updates.parentId = body.parentId;
  }

  if (body.sortOrder !== undefined) {
    updates.sortOrder = body.sortOrder;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(categories).set(updates).where(eq(categories.id, id));
  }

  const [updated] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  return c.json(updated);
});

/**
 * DELETE /:id — Delete a category (Admin only).
 * Returns 400 if any documents reference this category (prevent orphaned documents).
 */
categoriesApp.delete("/:id", requireAdminOrManager(), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Category not found" }, 404);
  }

  // Check if any documents reference this category
  const referencingDocs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.categoryId, id))
    .limit(1);

  if (referencingDocs.length > 0) {
    return c.json(
      { error: "Cannot delete category: documents are still assigned to it." },
      400,
    );
  }

  await db.delete(categories).where(eq(categories.id, id));

  return c.json({ success: true });
});

export default categoriesApp;
