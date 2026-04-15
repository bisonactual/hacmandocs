import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireAdminOrManager } from "../middleware/rbac";
import { categories, documents } from "../db/schema";

const categoriesApp = new Hono<Env>();

/**
 * GET / — List all categories (Viewer+).
 * Returns all categories with parent_id so the frontend can build the tree.
 */
categoriesApp.get("/", async (c) => {
  const db = drizzle(c.env.DB);

  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
      createdAt: categories.createdAt,
    })
    .from(categories);

  return c.json(rows);
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
