import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { documentVisibility, visibilityGroupMembers, visibilityGroups, categoryVisibility } from "../db/schema";

/**
 * Rank for each group level. Higher = more privileges.
 */
const GROUP_LEVEL_RANK: Record<string, number> = {
  Non_Member: 0,
  Member: 1,
  Team_Leader: 2,
  Manager: 3,
  Board_Member: 4,
};

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

  // Get all visibility assignments for matched documents (with group level)
  const visRows = await db
    .select({
      documentId: documentVisibility.documentId,
      groupId: documentVisibility.groupId,
      groupLevel: visibilityGroups.groupLevel,
    })
    .from(documentVisibility)
    .leftJoin(visibilityGroups, eq(documentVisibility.groupId, visibilityGroups.id))
    .where(inArray(documentVisibility.documentId, docIds));

  // Get groups the user belongs to
  const userGroups = session
    ? await db
        .select({ groupId: visibilityGroupMembers.groupId })
        .from(visibilityGroupMembers)
        .where(eq(visibilityGroupMembers.userId, session.userId))
    : [];

  const userGroupIds = new Set(userGroups.map((g) => g.groupId));
  const userLevelRank = session ? (GROUP_LEVEL_RANK[session.groupLevel] ?? 0) : 0;

  // Build a map: documentId → array of { groupId, groupLevel }
  const docGroupMap = new Map<string, { groupId: string; groupLevel: string | null }[]>();
  for (const row of visRows) {
    if (!docGroupMap.has(row.documentId)) {
      docGroupMap.set(row.documentId, []);
    }
    docGroupMap.get(row.documentId)!.push({ groupId: row.groupId, groupLevel: row.groupLevel });
  }

  // Filter: if document has groups, user must match by level hierarchy or explicit membership
  results = results.filter((r) => {
    const requiredGroups = docGroupMap.get(r.id);
    if (!requiredGroups || requiredGroups.length === 0) {
      return true;
    }
    // Check group level hierarchy
    for (const g of requiredGroups) {
      const requiredRank = GROUP_LEVEL_RANK[g.groupLevel ?? ""] ?? 0;
      if (userLevelRank >= requiredRank) return true;
    }
    // Check explicit membership
    for (const g of requiredGroups) {
      if (userGroupIds.has(g.groupId)) return true;
    }
    return false;
  });

  // Also filter by category visibility — docs in hidden categories are restricted
  const categoryIds = [...new Set(results.filter((r) => r.categoryId).map((r) => r.categoryId!))];
  if (categoryIds.length > 0) {
    const catVisRows = await db
      .select({
        categoryId: categoryVisibility.categoryId,
        groupId: categoryVisibility.groupId,
        groupLevel: visibilityGroups.groupLevel,
      })
      .from(categoryVisibility)
      .leftJoin(visibilityGroups, eq(categoryVisibility.groupId, visibilityGroups.id))
      .where(inArray(categoryVisibility.categoryId, categoryIds));

    const catGroupMap = new Map<string, { groupId: string; groupLevel: string | null }[]>();
    for (const row of catVisRows) {
      if (!catGroupMap.has(row.categoryId)) {
        catGroupMap.set(row.categoryId, []);
      }
      catGroupMap.get(row.categoryId)!.push({ groupId: row.groupId, groupLevel: row.groupLevel });
    }

    results = results.filter((r) => {
      if (!r.categoryId) return true;
      const catGroups = catGroupMap.get(r.categoryId);
      if (!catGroups || catGroups.length === 0) return true;
      for (const g of catGroups) {
        const requiredRank = GROUP_LEVEL_RANK[g.groupLevel ?? ""] ?? 0;
        if (userLevelRank >= requiredRank) return true;
      }
      for (const g of catGroups) {
        if (userGroupIds.has(g.groupId)) return true;
      }
      return false;
    });
  }

  return c.json({ results });
});

export default searchApp;
