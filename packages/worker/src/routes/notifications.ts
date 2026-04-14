import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import {
  notifications,
  certifications,
  toolRecords,
  editProposals,
  documents,
} from "../db/schema";

const DAY_SECONDS = 86400;

const notificationsApp = new Hono<Env>();

/**
 * GET / — List notifications for the current user (Viewer+).
 */
notificationsApp.get("/", requireRole("Viewer"), async (c) => {
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.userId));

  return c.json(rows);
});

/**
 * GET /feed — Aggregated notification feed for the bell icon.
 * Combines: proposal notifications, cert expiry warnings, pending proposals (for approvers).
 */
notificationsApp.get("/feed", requireRole("Viewer"), async (c) => {
  const session = c.get("session");
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  const feed: Array<{
    id: string;
    type: string;
    message: string;
    link: string | null;
    createdAt: number;
  }> = [];

  // 1. Existing proposal notifications (unread)
  const proposalNotifs = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, session.userId),
        eq(notifications.isRead, 0),
      ),
    );

  for (const n of proposalNotifs) {
    feed.push({
      id: `notif-${n.id}`,
      type: "proposal",
      message: `Proposal ${n.type}`,
      link: `/proposals/${n.proposalId}`,
      createdAt: n.createdAt,
    });
  }

  // 2. Certification expiry warnings for this user
  const userCerts = await db
    .select({
      id: certifications.id,
      toolRecordId: certifications.toolRecordId,
      expiresAt: certifications.expiresAt,
    })
    .from(certifications)
    .where(eq(certifications.userId, session.userId));

  // Get tool names for display
  const allTools = await db
    .select({ id: toolRecords.id, name: toolRecords.name })
    .from(toolRecords);
  const toolNameMap = new Map(allTools.map((t) => [t.id, t.name]));

  for (const cert of userCerts) {
    if (cert.expiresAt == null) continue;
    const daysLeft = Math.floor((cert.expiresAt - now) / DAY_SECONDS);
    const toolName = toolNameMap.get(cert.toolRecordId) ?? "Unknown tool";

    if (daysLeft <= 0) {
      feed.push({
        id: `cert-expired-${cert.id}`,
        type: "cert_expired",
        message: `Your ${toolName} certification has expired`,
        link: "/inductions/profile",
        createdAt: cert.expiresAt,
      });
    } else if (daysLeft <= 14) {
      feed.push({
        id: `cert-expiring-${cert.id}`,
        type: "cert_expiring",
        message: `${toolName} certification expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        link: "/inductions/profile",
        createdAt: now,
      });
    }
  }

  // 3. Pending proposals awaiting review (for Approvers/Admins)
  const isApprover =
    session.permissionLevel === "Approver" ||
    session.permissionLevel === "Admin";

  if (isApprover) {
    const pending = await db
      .select({
        id: editProposals.id,
        documentId: editProposals.documentId,
        createdAt: editProposals.createdAt,
      })
      .from(editProposals)
      .where(eq(editProposals.status, "pending"));

    // Get doc titles
    const allDocs = await db
      .select({ id: documents.id, title: documents.title })
      .from(documents);
    const docTitleMap = new Map(allDocs.map((d) => [d.id, d.title]));

    for (const p of pending) {
      const title = docTitleMap.get(p.documentId) ?? "Unknown document";
      feed.push({
        id: `pending-${p.id}`,
        type: "pending_proposal",
        message: `"${title}" is awaiting review`,
        link: `/proposals/${p.id}`,
        createdAt: p.createdAt,
      });
    }
  }

  // 4. User's own proposals that were approved/rejected recently (last 7 days)
  const recentCutoff = now - 7 * DAY_SECONDS;
  const userProposals = await db
    .select()
    .from(editProposals)
    .where(eq(editProposals.authorId, session.userId));

  const allDocsForProposals = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents);
  const docMap = new Map(allDocsForProposals.map((d) => [d.id, d.title]));

  for (const p of userProposals) {
    if (p.updatedAt < recentCutoff) continue;
    const title = docMap.get(p.documentId) ?? "Unknown document";

    if (p.status === "approved") {
      feed.push({
        id: `approved-${p.id}`,
        type: "proposal_approved",
        message: `Your edit to "${title}" was approved`,
        link: `/documents/${p.documentId}`,
        createdAt: p.updatedAt,
      });
    } else if (p.status === "rejected") {
      feed.push({
        id: `rejected-${p.id}`,
        type: "proposal_rejected",
        message: `Your edit to "${title}" was rejected`,
        link: `/proposals/${p.id}`,
        createdAt: p.updatedAt,
      });
    }
  }

  // Sort by most recent first, cap at 20
  feed.sort((a, b) => b.createdAt - a.createdAt);

  return c.json(feed.slice(0, 20));
});

/**
 * PUT /:id/read — Mark a notification as read (Viewer+).
 */
notificationsApp.put("/:id/read", requireRole("Viewer"), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(eq(notifications.id, id));

  return c.json({ success: true });
});

export default notificationsApp;
