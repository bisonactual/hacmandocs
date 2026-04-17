import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import { deleteProposals, documents, toolRecords } from "../db/schema";

const deleteProposalsApp = new Hono<Env>();

/**
 * Check if a document is linked to a tool record.
 */
async function getLinkedToolRecord(rawDb: D1Database, docPageId: string) {
  const db = drizzle(rawDb);
  const [linked] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.docPageId, docPageId))
    .limit(1);
  return linked ?? null;
}

/**
 * GET / — List delete proposals.
 * Query params: status, documentId
 */
deleteProposalsApp.get("/", requireRole("Viewer"), async (c) => {
  const db = drizzle(c.env.DB);
  const status = c.req.query("status");
  const documentId = c.req.query("documentId");

  let query = db.select().from(deleteProposals).$dynamic();

  if (documentId && status) {
    query = query.where(
      and(
        eq(deleteProposals.documentId, documentId),
        eq(deleteProposals.status, status),
      ),
    );
  } else if (documentId) {
    query = query.where(eq(deleteProposals.documentId, documentId));
  } else if (status) {
    query = query.where(eq(deleteProposals.status, status));
  }

  const rows = await query;
  return c.json(rows);
});

/**
 * POST / — Create a delete proposal (any authenticated user).
 * Admins/Approvers: deletes immediately (with confirmation on frontend).
 * Others: creates a pending proposal for review.
 */
deleteProposalsApp.post("/", requireRole("Viewer"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{
    documentId?: string;
    reason?: string;
  }>();

  if (!body.documentId) {
    return c.json({ error: "documentId is required" }, 400);
  }

  const db = drizzle(c.env.DB);

  // Verify document exists
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, body.documentId))
    .limit(1);

  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  // Guard: prevent deleting linked docs pages
  const linkedTool = await getLinkedToolRecord(c.env.DB, body.documentId);
  if (linkedTool) {
    return c.json({
      error: "This page is linked to a tool record and cannot be deleted. Delete the tool record first.",
    }, 400);
  }

  // Check for existing pending delete proposal
  const [existing] = await db
    .select()
    .from(deleteProposals)
    .where(
      and(
        eq(deleteProposals.documentId, body.documentId),
        eq(deleteProposals.status, "pending"),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({
      error: "A delete proposal is already pending for this document.",
      existingProposalId: existing.id,
    }, 409);
  }

  const isAdminOrApprover =
    session.permissionLevel === "Admin" ||
    session.permissionLevel === "Approver";

  const now = Math.floor(Date.now() / 1000);

  if (isAdminOrApprover) {
    // Immediate deletion — Admin/Approver confirmed on the frontend
    // Delete FTS entry first
    await c.env.DB.prepare(
      "DELETE FROM document_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)",
    )
      .bind(body.documentId)
      .run();

    await db.delete(documents).where(eq(documents.id, body.documentId));

    return c.json({ deleted: true, documentId: body.documentId });
  }

  // Non-privileged user — create a pending proposal
  const id = crypto.randomUUID();

  await db.insert(deleteProposals).values({
    id,
    documentId: body.documentId,
    reason: body.reason?.trim() || null,
    authorId: session.userId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(deleteProposals)
    .where(eq(deleteProposals.id, id))
    .limit(1);

  return c.json(created, 201);
});

/**
 * PUT /:id/approve — Approve a delete proposal (Approver+).
 * Actually deletes the document.
 */
deleteProposalsApp.put("/:id/approve", requireRole("Approver"), async (c) => {
  const id = c.req.param("id");
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  const [proposal] = await db
    .select()
    .from(deleteProposals)
    .where(eq(deleteProposals.id, id))
    .limit(1);

  if (!proposal) {
    return c.json({ error: "Delete proposal not found" }, 404);
  }

  if (proposal.status !== "pending") {
    return c.json({ error: "Only pending proposals can be approved" }, 400);
  }

  // Check if document is sensitive → require Admin
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, proposal.documentId))
    .limit(1);

  if (!doc) {
    // Document already gone — just mark approved
    const now = Math.floor(Date.now() / 1000);
    await db
      .update(deleteProposals)
      .set({ status: "approved", reviewerId: session.userId, updatedAt: now })
      .where(eq(deleteProposals.id, id));
    return c.json({ deleted: true });
  }

  if (doc.isSensitive && session.permissionLevel !== "Admin") {
    return c.json(
      { error: "Only Admins can approve deletion of sensitive documents" },
      403,
    );
  }

  const now = Math.floor(Date.now() / 1000);

  // Delete FTS entry
  await c.env.DB.prepare(
    "DELETE FROM document_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)",
  )
    .bind(proposal.documentId)
    .run();

  // Delete document and mark proposal approved
  await db.delete(documents).where(eq(documents.id, proposal.documentId));
  await db
    .update(deleteProposals)
    .set({ status: "approved", reviewerId: session.userId, updatedAt: now })
    .where(eq(deleteProposals.id, id));

  const [updated] = await db
    .select()
    .from(deleteProposals)
    .where(eq(deleteProposals.id, id))
    .limit(1);

  return c.json(updated);
});

/**
 * PUT /:id/reject — Reject a delete proposal (Approver+).
 */
deleteProposalsApp.put("/:id/reject", requireRole("Approver"), async (c) => {
  const id = c.req.param("id");
  const session = c.get("session");
  const db = drizzle(c.env.DB);
  const body = await c.req.json<{ reason?: string }>();

  const [proposal] = await db
    .select()
    .from(deleteProposals)
    .where(eq(deleteProposals.id, id))
    .limit(1);

  if (!proposal) {
    return c.json({ error: "Delete proposal not found" }, 404);
  }

  if (proposal.status !== "pending") {
    return c.json({ error: "Only pending proposals can be rejected" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  await db
    .update(deleteProposals)
    .set({
      status: "rejected",
      rejectionReason: body.reason ?? null,
      reviewerId: session.userId,
      updatedAt: now,
    })
    .where(eq(deleteProposals.id, id));

  const [updated] = await db
    .select()
    .from(deleteProposals)
    .where(eq(deleteProposals.id, id))
    .limit(1);

  return c.json(updated);
});

export default deleteProposalsApp;
