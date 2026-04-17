import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import {
  editProposals,
  documents,
  documentVersions,
} from "../db/schema";
import { extractPlainText } from "./documents";
import type { DocumentNode } from "@hacmandocs/shared";

const proposalsApp = new Hono<Env>();

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Check whether two section-lock arrays overlap.
 * Each array contains string section identifiers.
 */
export function sectionsOverlap(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  return b.some((s) => setA.has(s));
}

// ── GET / — List proposals (Editor+) ─────────────────────────────────

proposalsApp.get("/", requireRole("Viewer"), async (c) => {
  const db = drizzle(c.env.DB);
  const documentId = c.req.query("documentId");
  const status = c.req.query("status");

  let query = db.select().from(editProposals).$dynamic();

  if (documentId && status) {
    query = query.where(
      and(
        eq(editProposals.documentId, documentId),
        eq(editProposals.status, status),
      ),
    );
  } else if (documentId) {
    query = query.where(eq(editProposals.documentId, documentId));
  } else if (status) {
    query = query.where(eq(editProposals.status, status));
  }

  const rows = await query;
  return c.json(rows);
});


// ── GET /:id — Get single proposal (Editor+) ────────────────────────

proposalsApp.get("/:id", requireRole("Viewer"), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [proposal] = await db
    .select()
    .from(editProposals)
    .where(eq(editProposals.id, id))
    .limit(1);

  if (!proposal) {
    return c.json({ error: "Proposal not found" }, 404);
  }

  return c.json(proposal);
});

// ── POST / — Create proposal (Editor+) with section conflict detection ──

proposalsApp.post("/", requireRole("Viewer"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{
    documentId?: string;
    proposedContentJson?: DocumentNode;
    sectionLocks?: string[];
  }>();

  if (!body.documentId) {
    return c.json({ error: "documentId is required" }, 400);
  }
  if (!body.proposedContentJson) {
    return c.json({ error: "proposedContentJson is required" }, 400);
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

  // ── Section conflict detection (Task 10.2) ─────────────────────────
  const sectionLocks = body.sectionLocks ?? [];

  if (sectionLocks.length > 0) {
    // Fetch all pending proposals for the same document
    const pendingProposals = await db
      .select()
      .from(editProposals)
      .where(
        and(
          eq(editProposals.documentId, body.documentId),
          eq(editProposals.status, "pending"),
        ),
      );

    for (const existing of pendingProposals) {
      if (existing.sectionLocksJson) {
        const existingLocks: string[] = JSON.parse(existing.sectionLocksJson);
        if (sectionsOverlap(sectionLocks, existingLocks)) {
          return c.json(
            {
              error:
                "This section is currently being reviewed in another proposal. Please wait for it to be resolved.",
              conflictingProposalId: existing.id,
            },
            409,
          );
        }
      }
    }
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(editProposals).values({
    id,
    documentId: body.documentId,
    proposedContentJson: JSON.stringify(body.proposedContentJson),
    sectionLocksJson: sectionLocks.length > 0 ? JSON.stringify(sectionLocks) : null,
    authorId: session.userId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(editProposals)
    .where(eq(editProposals.id, id))
    .limit(1);

  return c.json(created, 201);
});


// ── PUT /:id/approve — Approve proposal (Approver+ / Admin for sensitive) ──

proposalsApp.put("/:id/approve", requireRole("Approver"), async (c) => {
  const id = c.req.param("id");
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  const [proposal] = await db
    .select()
    .from(editProposals)
    .where(eq(editProposals.id, id))
    .limit(1);

  if (!proposal) {
    return c.json({ error: "Proposal not found" }, 404);
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
    return c.json({ error: "Document not found" }, 404);
  }

  if (doc.isSensitive && session.permissionLevel !== "Admin") {
    return c.json(
      { error: "Only Admins can approve proposals for sensitive documents" },
      403,
    );
  }

  // Determine next version number
  const existingVersions = await db
    .select({ versionNumber: documentVersions.versionNumber })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, proposal.documentId));

  const maxVersion = existingVersions.reduce(
    (max, v) => Math.max(max, v.versionNumber),
    0,
  );
  const nextVersion = maxVersion + 1;

  const now = Math.floor(Date.now() / 1000);
  const versionId = crypto.randomUUID();

  // Use D1 batch for atomic operations
  const proposedContent = proposal.proposedContentJson;
  const contentText = extractPlainText(
    JSON.parse(proposedContent) as DocumentNode,
  );

  await c.env.DB.batch([
    // 1. Update document content
    c.env.DB.prepare(
      "UPDATE documents SET content_json = ?, updated_at = ? WHERE id = ?",
    ).bind(proposedContent, now, proposal.documentId),

    // 2. Create version entry
    c.env.DB.prepare(
      "INSERT INTO document_versions (id, document_id, content_json, author_id, approved_by, approval_details, version_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      versionId,
      proposal.documentId,
      proposedContent,
      proposal.authorId,
      session.userId,
      `Approved by ${session.userId}`,
      nextVersion,
      now,
    ),

    // 3. Update proposal status
    c.env.DB.prepare(
      "UPDATE edit_proposals SET status = 'approved', reviewer_id = ?, updated_at = ? WHERE id = ?",
    ).bind(session.userId, now, id),
  ]);

  // Sync FTS5 index
  try {
    await c.env.DB.prepare(
      "DELETE FROM document_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)",
    )
      .bind(proposal.documentId)
      .run();

    await c.env.DB.prepare(
      "INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)",
    )
      .bind(proposal.documentId, doc.title, contentText)
      .run();
  } catch {
    // FTS sync failure is non-fatal — search index may be stale until next edit
  }

  // Return updated proposal
  const [updated] = await db
    .select()
    .from(editProposals)
    .where(eq(editProposals.id, id))
    .limit(1);

  return c.json(updated);
});

// ── PUT /:id/reject — Reject proposal (Approver+ / Admin for sensitive) ──

proposalsApp.put("/:id/reject", requireRole("Approver"), async (c) => {
  const id = c.req.param("id");
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  const body = await c.req.json<{ reason?: string }>();

  const [proposal] = await db
    .select()
    .from(editProposals)
    .where(eq(editProposals.id, id))
    .limit(1);

  if (!proposal) {
    return c.json({ error: "Proposal not found" }, 404);
  }

  if (proposal.status !== "pending") {
    return c.json({ error: "Only pending proposals can be rejected" }, 400);
  }

  // Check if document is sensitive → require Admin
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, proposal.documentId))
    .limit(1);

  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  if (doc.isSensitive && session.permissionLevel !== "Admin") {
    return c.json(
      { error: "Only Admins can reject proposals for sensitive documents" },
      403,
    );
  }

  const now = Math.floor(Date.now() / 1000);

  await db
    .update(editProposals)
    .set({
      status: "rejected",
      rejectionReason: body.reason ?? null,
      reviewerId: session.userId,
      updatedAt: now,
    })
    .where(eq(editProposals.id, id));

  const [updated] = await db
    .select()
    .from(editProposals)
    .where(eq(editProposals.id, id))
    .limit(1);

  return c.json(updated);
});


// ── GET /:id/diff — Diff for a proposal (Editor+) (Task 10.3) ───────

proposalsApp.get("/:id/diff", requireRole("Viewer"), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [proposal] = await db
    .select()
    .from(editProposals)
    .where(eq(editProposals.id, id))
    .limit(1);

  if (!proposal) {
    return c.json({ error: "Proposal not found" }, 404);
  }

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, proposal.documentId))
    .limit(1);

  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  const before: DocumentNode = JSON.parse(doc.contentJson);
  const after: DocumentNode = JSON.parse(proposal.proposedContentJson);

  return c.json({
    before,
    after,
    changes: [],
  });
});

export default proposalsApp;
