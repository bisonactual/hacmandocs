import { Hono } from "hono";
import { eq, asc, isNull, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import { checkDocumentVisibility, checkCategoryVisibility } from "../middleware/visibility";
import { documents, documentVersions, documentVisibility, categoryVisibility, visibilityGroups, visibilityGroupMembers, toolRecords } from "../db/schema";
import type { DocumentNode } from "@hacmandocs/shared";
import { validateLockedEdit } from "../services/tool-docs";

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

/**
 * Check if a document is linked to a tool record.
 * Returns the tool record if found, null otherwise.
 */
async function getLinkedToolRecord(
  rawDb: D1Database,
  docPageId: string,
) {
  const db = drizzle(rawDb);
  const [linked] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.docPageId, docPageId))
    .limit(1);
  return linked ?? null;
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
    .from(documents)
    .where(isNull(documents.deletedAt));

  // Admins see everything
  if (session?.permissionLevel === "Admin") {
    return c.json(rows);
  }

  const userLevelRank = session ? (GROUP_LEVEL_RANK[session.groupLevel] ?? 0) : 0;

  let userGroupIds = new Set<string>();
  if (session) {
    const memberships = await db
      .select({ groupId: visibilityGroupMembers.groupId })
      .from(visibilityGroupMembers)
      .where(eq(visibilityGroupMembers.userId, session.userId));
    userGroupIds = new Set(memberships.map((m) => m.groupId));
  }

  // Get ALL doc-level visibility assignments (no WHERE — avoids D1 parameter limit)
  const docVisRows = await db
    .select({ documentId: documentVisibility.documentId, groupId: documentVisibility.groupId, groupLevel: visibilityGroups.groupLevel })
    .from(documentVisibility)
    .leftJoin(visibilityGroups, eq(documentVisibility.groupId, visibilityGroups.id));

  const docGroupMap = new Map<string, { groupId: string; groupLevel: string | null }[]>();
  for (const row of docVisRows) {
    if (!docGroupMap.has(row.documentId)) docGroupMap.set(row.documentId, []);
    docGroupMap.get(row.documentId)!.push({ groupId: row.groupId, groupLevel: row.groupLevel });
  }

  // Get ALL category-level visibility assignments
  const catVisRows = await db
    .select({ categoryId: categoryVisibility.categoryId, groupId: categoryVisibility.groupId, groupLevel: visibilityGroups.groupLevel })
    .from(categoryVisibility)
    .leftJoin(visibilityGroups, eq(categoryVisibility.groupId, visibilityGroups.id));

  const catGroupMap = new Map<string, { groupId: string; groupLevel: string | null }[]>();
  for (const row of catVisRows) {
    if (!catGroupMap.has(row.categoryId)) catGroupMap.set(row.categoryId, []);
    catGroupMap.get(row.categoryId)!.push({ groupId: row.groupId, groupLevel: row.groupLevel });
  }

  const canAccess = (groups: { groupId: string; groupLevel: string | null }[]) => {
    for (const g of groups) {
      if (userLevelRank >= (GROUP_LEVEL_RANK[g.groupLevel ?? ""] ?? 0)) return true;
    }
    for (const g of groups) {
      if (userGroupIds.has(g.groupId)) return true;
    }
    return false;
  };

  const filtered = rows.filter((r) => {
    const docGroups = docGroupMap.get(r.id);
    if (docGroups && docGroups.length > 0 && !canAccess(docGroups)) return false;
    if (r.categoryId) {
      const catGroups = catGroupMap.get(r.categoryId);
      if (catGroups && catGroups.length > 0 && !canAccess(catGroups)) return false;
    }
    return true;
  });

  return c.json(filtered);
});

/**
 * GET /recycle-bin — List soft-deleted documents (Admin/Approver only).
 */
documentsApp.get("/recycle-bin", requireRole("Approver"), async (c) => {
  const db = drizzle(c.env.DB);

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      categoryId: documents.categoryId,
      isSensitive: documents.isSensitive,
      deletedAt: documents.deletedAt,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(isNotNull(documents.deletedAt));

  return c.json(rows);
});

/**
 * GET /:id — Get a single document by ID.
 * Checks document-level and category-level visibility before returning.
 */
documentsApp.get("/:id", async (c) => {
  const id = c.req.param("id");

  // Skip named sub-routes — handled separately
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

  // Soft-deleted docs are only visible to Admins/Approvers (recycle bin)
  if (doc.deletedAt) {
    const session2 = c.get("session") as import("../auth/session").SessionData | undefined;
    const perm = session2?.permissionLevel;
    if (perm !== "Admin" && perm !== "Approver") {
      return c.json({ error: "Document not found" }, 404);
    }
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

  // Guard: check if this document is linked to a tool record
  const linkedTool = await getLinkedToolRecord(c.env.DB, id);
  if (linkedTool) {
    if (body.title !== undefined && body.title.trim() !== existing.title) {
      return c.json({ error: "This page's title is managed by the linked tool record and cannot be changed manually." }, 400);
    }
    if (body.categoryId !== undefined && body.categoryId !== existing.categoryId) {
      return c.json({ error: "This page's category is managed by the linked tool record and cannot be changed manually." }, 400);
    }
    if (body.contentJson !== undefined) {
      const existingContent = JSON.parse(existing.contentJson) as DocumentNode;
      const lockError = validateLockedEdit(existingContent, body.contentJson);
      if (lockError) {
        return c.json({ error: lockError }, 400);
      }
    }
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

  // Guard: prevent unpublishing linked docs pages
  if (body.published === false) {
    const linkedTool = await getLinkedToolRecord(c.env.DB, id);
    if (linkedTool) {
      return c.json({ error: "This page is linked to a tool record and must remain published." }, 400);
    }
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
 * PUT /:id/restore — Restore a soft-deleted document (Admin/Approver).
 */
documentsApp.put("/:id/restore", requireRole("Approver"), async (c) => {
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

  if (!existing.deletedAt) {
    return c.json({ error: "Document is not in the recycle bin" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  await db
    .update(documents)
    .set({ deletedAt: null, updatedAt: now })
    .where(eq(documents.id, id));

  // Re-index for FTS
  const contentText = extractPlainText(JSON.parse(existing.contentJson) as DocumentNode);
  await c.env.DB.prepare(
    "INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)",
  )
    .bind(id, existing.title, contentText)
    .run();

  return c.json({ success: true });
});

/**
 * DELETE /:id — Permanently delete a document (Admin only).
 * Only works on soft-deleted documents (recycle bin).
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

  if (!existing.deletedAt) {
    return c.json({ error: "Document must be in the recycle bin before permanent deletion. Soft-delete it first." }, 400);
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
 * GET /:id — Get a single document by ID.
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
