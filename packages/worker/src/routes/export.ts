import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, inArray } from "drizzle-orm";
import { zipSync } from "fflate";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import { documents, categories } from "../db/schema";
import { toMarkdown, type DocumentNode } from "@hacmandocs/shared";

const exportApp = new Hono<Env>();

/**
 * Sanitise a string for use as a filename (replace unsafe chars with underscores).
 */
function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
}

/**
 * GET /:id — Export a single document as Markdown (Editor+).
 */
exportApp.get("/:id", requireRole("Editor"), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "Document not found" }, 404);
  }

  const doc = rows[0];
  const contentNode: DocumentNode = JSON.parse(doc.contentJson);
  const markdown = toMarkdown(contentNode);
  const filename = `${sanitiseFilename(doc.title)}.md`;

  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});


/**
 * POST /bulk — Bulk export documents as a ZIP (Editor+).
 * Accepts { documentIds?: string[] }. If empty/missing, exports all documents.
 */
exportApp.post("/bulk", requireRole("Editor"), async (c) => {
  const body = await c.req.json<{ documentIds?: string[] }>();
  const db = drizzle(c.env.DB);

  // Fetch documents — all or filtered by IDs
  let docs: (typeof documents.$inferSelect)[];
  if (body.documentIds && body.documentIds.length > 0) {
    docs = await db
      .select()
      .from(documents)
      .where(inArray(documents.id, body.documentIds));
  } else {
    docs = await db.select().from(documents);
  }

  if (docs.length === 0) {
    return c.json({ error: "No documents found" }, 404);
  }

  // Fetch all categories for folder structure lookup
  const allCategories = await db.select().from(categories);
  const categoryMap = new Map(allCategories.map((cat) => [cat.id, cat]));

  /**
   * Build the folder path for a category by walking up parentId chain.
   */
  function getCategoryPath(categoryId: string | null): string {
    if (!categoryId) return "";
    const parts: string[] = [];
    let current = categoryMap.get(categoryId);
    while (current) {
      parts.unshift(sanitiseFilename(current.name));
      current = current.parentId ? categoryMap.get(current.parentId) : undefined;
    }
    return parts.join("/");
  }

  // Build ZIP entries: { "path/file.md": Uint8Array }
  const zipEntries: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();

  for (const doc of docs) {
    const contentNode: DocumentNode = JSON.parse(doc.contentJson);
    const markdown = toMarkdown(contentNode);
    const folder = getCategoryPath(doc.categoryId);
    const filename = `${sanitiseFilename(doc.title)}.md`;
    const path = folder ? `${folder}/${filename}` : filename;
    zipEntries[path] = encoder.encode(markdown);
  }

  const zipData = zipSync(zipEntries);

  return new Response(zipData, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="export.zip"',
    },
  });
});

export default exportApp;
