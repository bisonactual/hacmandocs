import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { documentVisibility, visibilityGroupMembers } from "../db/schema";

const searchApp = new Hono<Env>();

/**
 * GET / — Full-text search over documents (Viewer+).
 * Uses FTS5 MATCH with bm25() ranking.
 * Filters results by the user's visibility group membership.
 */
searchApp.get("/", async (c) => {
  const q = c.req.query("q");

  if (!q || !q.trim()) {
    return c.json({ results: [] });
  }

  const session = c.get("session") as import("../auth/session").SessionData | undefined;
  const db = drizzle(c.env.DB);

  // Run FTS5 search with bm25 ranking
  const ftsResults = await c.env.DB.prepare(
    `SELECT rowid, title, snippet(document_fts, 1, '<b>', '</b>', '...', 20) as snippet, bm25(document_fts) as rank
     FROM document_fts
     WHERE document_fts MATCH ?
     ORDER BY rank`,
  )
    .bind(q.trim())
    .all<{ rowid: number; title: string; snippet: string; rank: number }>();

  if (!ftsResults.results || ftsResults.results.length === 0) {
    return c.json({ results: [] });
  }

  // Get the rowids to join with documents table
  const rowids = ftsResults.results.map((r) => r.rowid);

  // Fetch matching documents to get id, categoryId, updatedAt
  // We need to use raw SQL to match by rowid
  const placeholders = rowids.map(() => "?").join(",");
  const docRows = await c.env.DB.prepare(
    `SELECT rowid, id, category_id, updated_at FROM documents WHERE rowid IN (${placeholders})`,
  )
    .bind(...rowids)
    .all<{ rowid: number; id: string; category_id: string | null; updated_at: number }>();

  const docMap = new Map<number, { id: string; categoryId: string | null; updatedAt: number }>();
  for (const row of docRows.results) {
    docMap.set(row.rowid, {
      id: row.id,
      categoryId: row.category_id,
      updatedAt: row.updated_at,
    });
  }

  // Build initial results
  let results = ftsResults.results
    .map((fts) => {
      const doc = docMap.get(fts.rowid);
      if (!doc) return null;
      return {
        id: doc.id,
        title: fts.title,
        categoryId: doc.categoryId,
        snippet: fts.snippet,
        updatedAt: doc.updatedAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Admins see everything — skip visibility filtering
  if (!session || session.permissionLevel === "Admin") {
    return c.json({ results });
  }

  // Filter by visibility groups: for each document, check if it has group
  // assignments. If it does, the user must belong to at least one group.
  const docIds = results.map((r) => r.id);

  if (docIds.length === 0) {
    return c.json({ results: [] });
  }

  // Get all visibility assignments for matched documents
  const visRows = await db
    .select({
      documentId: documentVisibility.documentId,
      groupId: documentVisibility.groupId,
    })
    .from(documentVisibility)
    .where(inArray(documentVisibility.documentId, docIds));

  // Get groups the user belongs to
  const userGroups = session
    ? await db
        .select({ groupId: visibilityGroupMembers.groupId })
        .from(visibilityGroupMembers)
        .where(eq(visibilityGroupMembers.userId, session.userId))
    : [];

  const userGroupIds = new Set(userGroups.map((g) => g.groupId));

  // Build a map: documentId → set of required group IDs
  const docGroupMap = new Map<string, Set<string>>();
  for (const row of visRows) {
    if (!docGroupMap.has(row.documentId)) {
      docGroupMap.set(row.documentId, new Set());
    }
    docGroupMap.get(row.documentId)!.add(row.groupId);
  }

  // Filter: if document has groups, user must be in at least one
  results = results.filter((r) => {
    const requiredGroups = docGroupMap.get(r.id);
    if (!requiredGroups || requiredGroups.size === 0) {
      // No visibility groups → standard RBAC (already passed requireRole)
      return true;
    }
    // User must belong to at least one assigned group
    for (const gid of requiredGroups) {
      if (userGroupIds.has(gid)) return true;
    }
    return false;
  });

  return c.json({ results });
});

export default searchApp;
