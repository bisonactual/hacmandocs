import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import { documents, documentVersions } from "../db/schema";
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

/**
 * GET / — List all documents (public).
 * Returns metadata only (no content_json) for performance.
 * Visibility-restricted docs are filtered out for non-members.
 */
documentsApp.get("/", async (c) => {
  const db = drizzle(c.env.DB);

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

  return c.json(rows);
});

/**
 * GET /:id — Get a single document by ID (public).
 * Returns the full document including content_json.
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

  return c.json(doc);
});


/**
 * POST / — Create a new document (any authenticated user).
 * Editors+ get the document created directly (unpublished).
 * Viewers create the document as unpublished — it will need approval.
 * Accepts title, contentJson, categoryId (optional), isSensitive (optional, Admin only).
 * Syncs FTS5 index after insert.
 */
documentsApp.post("/", requireRole("Viewer"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{
    title?: string;
    contentJson?: DocumentNode;
    categoryId?: string | null;
    isSensitive?: boolean;
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
