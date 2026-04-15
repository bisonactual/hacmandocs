import { Hono } from "hono";
import { eq, asc, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import { checkDocumentVisibility, checkCategoryVisibility } from "../middleware/visibility";
import { documents, documentVersions, documentVisibility, categoryVisibility, visibilityGroups, visibilityGroupMembers } from "../db/schema";
import type { DocumentNode } from "@hacmandocs/shared";

/**
 * Extract plain text from a ProseMirror/TipTap JSON document node.
 * Walks the tree recursively and concatenates all text nodes.
 */
export function extractPlainText(node: DocumentNode): string {
  if (node.text) {
    return node.text;
  }
  if (node.content) {
    return node.content.map(extractPlainText).join(" ");
  }
  return "";
}

const documentsApp = new Hono<Env>();

const GROUP_LEVEL_RANK: Record<string, number> = {
  Non_Member: 0,
  Member: 1,
  Team_Leader: 2,
  Manager: 3,
  Board_Member: 4,
};

/**
 * GET / — List all documents.
 * Returns metadata only (no content_json) for performance.
 * Filters out docs the user can't access via document or category visibility.
 */
documentsApp.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const session = c.get("session") as import("../auth/session").SessionData | undefined;

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      categoryId: documents.categoryId,
      isSensitive: documents.isSensitive,
      isPublished: documents.isPublished,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents);

  console.log("[DEBUG] GET /api/documents — total rows:", rows.length);
  console.log("[DEBUG] session:", session ? { permissionLevel: session.permissionLevel, groupLevel: session.groupLevel, userId: session.userId } : "none");

  // Admins see everything
  if (session?.permissionLevel === "Admin") {
    console.log("[DEBUG] Admin bypass — returning all rows");
    return c.json(rows);
  }

  const userLevelRank = session ? (GROUP_LEVEL_RANK[session.groupLevel] ?? 0) : 0;
  console.log("[DEBUG] userLevelRank:", userLevelRank);

  let userGroupIds = new Set<string>();
  if (session) {
    const memberships = await db
      .select({ groupId: visibilityGroupMembers.groupId })
      .from(visibilityGroupMembers)
      .where(eq(visibilityGroupMembers.userId, session.userId));
    userGroupIds = new Set(memberships.map((m) => m.groupId));
    console.log("[DEBUG] userGroupIds:", [...userGroupIds]);
  }

  // Get doc-level visibility assignments
  const docIds = rows.map((r) => r.id);
  const docVisRows = docIds.length > 0
    ? await db
        .select({ documentId: documentVisibility.documentId, groupId: documentVisibility.groupId, groupLevel: visibilityGroups.groupLevel })
        .from(documentVisibility)
        .leftJoin(visibilityGroups, eq(documentVisibility.groupId, visibilityGroups.id))
        .where(inArray(documentVisibility.documentId, docIds))
    : [];

  console.log("[DEBUG] docVisRows:", docVisRows.length, JSON.stringify(docVisRows));

  const docGroupMap = new Map<string, { groupId: string; groupLevel: string | null }[]>();
  for (const row of docVisRows) {
    if (!docGroupMap.has(row.documentId)) docGroupMap.set(row.documentId, []);
    docGroupMap.get(row.documentId)!.push({ groupId: row.groupId, groupLevel: row.groupLevel });
  }

  console.log("[DEBUG] docs with visibility groups:", docGroupMap.size);

  // Get category-level visibility assignments
  const catIds = [...new Set(rows.filter((r) => r.categoryId).map((r) => r.categoryId!))];
  const catVisRows = catIds.length > 0
    ? await db
        .select({ categoryId: categoryVisibility.categoryId, groupId: categoryVisibility.groupId, groupLevel: visibilityGroups.groupLevel })
        .from(categoryVisibility)
        .leftJoin(visibilityGroups, eq(categoryVisibility.groupId, visibilityGroups.id))
        .where(inArray(categoryVisibility.categoryId, catIds))
    : [];

  console.log("[DEBUG] catVisRows:", catVisRows.length, JSON.stringify(catVisRows));

  const catGroupMap = new Map<string, { groupId: string; groupLevel: string | null }[]>();
  for (const row of catVisRows) {
    if (!catGroupMap.has(row.categoryId)) catGroupMap.set(row.categoryId, []);
    catGroupMap.get(row.categoryId)!.push({ groupId: row.groupId, groupLevel: row.groupLevel });
  }

  console.log("[DEBUG] categories with visibility groups:", catGroupMap.size);

  const canAccess = (groups: { groupId: string; groupLevel: string | null }[]) => {
    for (const g of groups) {
      if (userLevelRank >= (GROUP_LEVEL_RANK[g.groupLevel ?? ""] ?? 0)) return true;
    }
    for (const g of groups) {
      if (userGroupIds.has(g.groupId)) return true;
    }
    return false;
  };

  let blockedByDoc = 0;
  let blockedByCat = 0;

  const filtered = rows.filter((r) => {
    const docGroups = docGroupMap.get(r.id);
    if (docGroups && docGroups.length > 0 && !canAccess(docGroups)) {
      blockedByDoc++;
      return false;
    }
    if (r.categoryId) {
      const catGroups = catGroupMap.get(r.categoryId);
      if (catGroups && catGroups.length > 0 && !canAccess(catGroups)) {
        blockedByCat++;
        return false;
      }
    }
    return true;
  });

  console.log("[DEBUG] filtered:", filtered.length, "blockedByDoc:", blockedByDoc, "blockedByCat:", blockedByCat);

  return c.json(filtered);
});

/**
 * GET /:id — Get a single document by ID.
 * Checks document-level and category-level visibility before returning.
 */
documentsApp.get("/:id", async (c) => {
  const id = c.req.param("id");

  // Skip version history route — handled separately
  if (id === "versions") return;

  const db = drizzle(c.env.DB);

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  // Check visibility — unauthenticated users only see unrestricted docs
  const session = c.get("session") as import("../auth/session").SessionData | undefined;
  const permissionLevel = session?.permissionLevel ?? "Viewer";
  const groupLevel = session?.groupLevel;
  const userId = session?.userId ?? "";

  // Check document-level visibility
  const docVisible = await checkDocumentVisibility(c.env.DB, userId, id, permissionLevel, groupLevel);
  if (!docVisible) {
    return c.json({ error: "Document not found" }, 404);
  }

  // Check category-level visibility
  if (doc.categoryId) {
    const catVisible = await checkCategoryVisibility(c.env.DB, userId, doc.categoryId, permissionLevel, groupLevel);
    if (!catVisible) {
      return c.json({ error: "Document not found" }, 404);
    }
  }

  return c.json(doc);
});


/**
 * POST / — Create a new document (any authenticated user).
 * Editors+ get the document created directly (unpublished).
 * Viewers create the document as unpublished — it will need approval.
 * Accepts title, contentJson, categoryId (optional), isSensitive (optional, Admin only),
 * groupIds (optional, Admin/Manager only — assigns visibility groups on creation).
 * Syncs FTS5 index after insert.
 */
documentsApp.post("/", requireRole("Viewer"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{
    title?: string;
    contentJson?: DocumentNode;
    categoryId?: string | null;
    isSensitive?: boolean;
    groupIds?: string[];
  }>();

  if (!body.title || !body.title.trim()) {
    return c.json({ error: "Document title is required." }, 400);
  }

  if (!body.contentJson) {
    return c.json({ error: "Document content is required." }, 400);
  }

  // Only Admins can set isSensitive
  const isSensitive =
    body.isSensitive && session.permissionLevel === "Admin" ? 1 : 0;

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const contentJsonStr = JSON.stringify(body.contentJson);
  const contentText = extractPlainText(body.contentJson);

  const db = drizzle(c.env.DB);

  await db.insert(documents).values({
    id,
    title: body.title.trim(),
    contentJson: contentJsonStr,
    categoryId: body.categoryId ?? null,
    isSensitive,
    isPublished: 0,
    createdBy: session.userId,
    createdAt: now,
    updatedAt: now,
  });

  // Sync FTS5 index — use raw SQL since Drizzle doesn't support virtual tables
  await c.env.DB.prepare(
    "INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)",
  )
    .bind(id, body.title.trim(), contentText)
    .run();

  // Assign visibility groups if provided (Admin/Manager only)
  if (
    body.groupIds &&
    body.groupIds.length > 0 &&
    (session.permissionLevel === "Admin" || session.groupLevel === "Manager")
  ) {
    for (const groupId of body.groupIds) {
      await db.insert(documentVisibility).values({
        documentId: id,
        groupId,
        assignedAt: now,
      });
    }
  }

  // Return the created document
  const [created] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  return c.json(created, 201);
});

/**
 * PUT /:id — Update a document (Editor+).
 * Accepts title, contentJson, categoryId, isSensitive (Admin only for toggling).
 * Syncs FTS5 index on update.
 */
documentsApp.put("/:id", requireRole("Editor"), async (c) => {
  const id = c.req.param("id");
  const session = c.get("session");
  const body = await c.req.json<{
    title?: string;
    contentJson?: DocumentNode;
    categoryId?: string | null;
    isSensitive?: boolean;
  }>();

  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Document not found" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);

  const updates: Record<string, unknown> = { updatedAt: now };

  if (body.title !== undefined) {
    if (!body.title.trim()) {
      return c.json({ error: "Document title is required." }, 400);
    }
    updates.title = body.title.trim();
  }

  if (body.contentJson !== undefined) {
    updates.contentJson = JSON.stringify(body.contentJson);
  }

  if (body.categoryId !== undefined) {
    updates.categoryId = body.categoryId;
  }

  // Only Admins can toggle isSensitive
  if (body.isSensitive !== undefined && session.permissionLevel === "Admin") {
    updates.isSensitive = body.isSensitive ? 1 : 0;
  }

  await db.update(documents).set(updates).where(eq(documents.id, id));

  // Sync FTS5 index if title or content changed
  if (body.title !== undefined || body.contentJson !== undefined) {
    const newTitle =
      (updates.title as string) ?? existing.title;
    const newContentText = body.contentJson
      ? extractPlainText(body.contentJson)
      : extractPlainText(JSON.parse(existing.contentJson) as DocumentNode);

    // Delete old FTS entry and insert new one
    await c.env.DB.prepare(
      "DELETE FROM document_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)",
    )
      .bind(id)
      .run();

    await c.env.DB.prepare(
      "INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)",
    )
      .bind(id, newTitle, newContentText)
      .run();
  }

  const [updated] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  return c.json(updated);
});

/**
 * PUT /:id/publish — Publish or unpublish a document (Admin only).
 */
documentsApp.put("/:id/publish", requireRole("Admin"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ published?: boolean }>();
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Document not found" }, 404);
  }

  const isPublished = body.published !== false ? 1 : 0;
  const now = Math.floor(Date.now() / 1000);

  await db
    .update(documents)
    .set({ isPublished, updatedAt: now })
    .where(eq(documents.id, id));

  return c.json({ success: true, isPublished });
});

/**
 * DELETE /:id — Delete a document (Admin only).
 * Also removes the FTS5 index entry.
 */
documentsApp.delete("/:id", requireRole("Admin"), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Document not found" }, 404);
  }

  // Delete FTS entry first (before the document row is gone)
  await c.env.DB.prepare(
    "DELETE FROM document_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)",
  )
    .bind(id)
    .run();

  await db.delete(documents).where(eq(documents.id, id));

  return c.json({ success: true });
});

/**
 * GET /:id/versions — Version history for a document (Viewer+).
 * Returns all DocumentVersion entries ordered by version_number ascending.
 */
documentsApp.get("/:id/versions", async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  // Verify document exists
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  const versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, id))
    .orderBy(asc(documentVersions.versionNumber));

  return c.json(versions);
});

export default documentsApp;
