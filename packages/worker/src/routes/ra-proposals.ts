import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import { raProposals, riskAssessments, toolRecords, toolTrainers } from "../db/schema";
import type { RiskAssessmentContent } from "@hacmandocs/shared";

const raProposalsApp = new Hono<Env>();

// ── Permission helpers ────────────────────────────────────────────────

const GROUP_RANK: Record<string, number> = {
  Non_Member: 0, Member: 1, Team_Leader: 2, Manager: 3, Board_Member: 4,
};

function isTeamLeaderPlus(groupLevel: string): boolean {
  return (GROUP_RANK[groupLevel] ?? 0) >= GROUP_RANK.Team_Leader;
}

function canReview(permissionLevel: string, groupLevel: string): boolean {
  return (
    permissionLevel === "Admin" ||
    permissionLevel === "Approver" ||
    groupLevel === "Manager" ||
    isTeamLeaderPlus(groupLevel)
  );
}

async function isTrainerForTool(
  db: ReturnType<typeof drizzle>,
  userId: string,
  toolRecordId: string,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(toolTrainers)
    .where(and(eq(toolTrainers.userId, userId), eq(toolTrainers.toolRecordId, toolRecordId)))
    .limit(1);
  return rows.length > 0;
}

// ── GET / — List RA proposals (Viewer+) ──────────────────────────────

raProposalsApp.get("/", requireRole("Viewer"), async (c) => {
  const db = drizzle(c.env.DB);
  const toolRecordId = c.req.query("toolRecordId");
  const status = c.req.query("status");

  let query = db.select().from(raProposals).$dynamic();

  if (toolRecordId && status) {
    query = query.where(and(eq(raProposals.toolRecordId, toolRecordId), eq(raProposals.status, status)));
  } else if (toolRecordId) {
    query = query.where(eq(raProposals.toolRecordId, toolRecordId));
  } else if (status) {
    query = query.where(eq(raProposals.status, status));
  }

  const rows = await query;
  return c.json(rows);
});

// ── GET /:id — Get single RA proposal (Viewer+) ──────────────────────

raProposalsApp.get("/:id", requireRole("Viewer"), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [proposal] = await db
    .select()
    .from(raProposals)
    .where(eq(raProposals.id, id))
    .limit(1);

  if (!proposal) return c.json({ error: "RA proposal not found" }, 404);

  return c.json({
    ...proposal,
    proposedContent: JSON.parse(proposal.proposedContentJson) as RiskAssessmentContent,
  });
});

// ── GET /:id/diff — Structured diff of current vs proposed ───────────

raProposalsApp.get("/:id/diff", requireRole("Viewer"), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [proposal] = await db
    .select()
    .from(raProposals)
    .where(eq(raProposals.id, id))
    .limit(1);

  if (!proposal) return c.json({ error: "RA proposal not found" }, 404);

  const [ra] = await db
    .select()
    .from(riskAssessments)
    .where(eq(riskAssessments.id, proposal.raId))
    .limit(1);

  if (!ra) return c.json({ error: "Risk assessment not found" }, 404);

  const current = JSON.parse(ra.contentJson) as RiskAssessmentContent;
  const proposed = JSON.parse(proposal.proposedContentJson) as RiskAssessmentContent;

  return c.json({ current, proposed, proposalId: id, status: proposal.status });
});

// ── POST / — Create RA proposal (any authenticated user) ─────────────

raProposalsApp.post("/", requireRole("Viewer"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{
    toolRecordId?: string;
    proposedContent?: RiskAssessmentContent;
  }>();

  if (!body.toolRecordId) return c.json({ error: "toolRecordId is required" }, 400);
  if (!body.proposedContent) return c.json({ error: "proposedContent is required" }, 400);

  const db = drizzle(c.env.DB);

  const [ra] = await db
    .select()
    .from(riskAssessments)
    .where(and(eq(riskAssessments.toolRecordId, body.toolRecordId)))
    .limit(1);

  if (!ra) return c.json({ error: "No risk assessment found for this tool." }, 404);
  if (ra.status !== "published") {
    return c.json({ error: "Can only propose edits to published risk assessments." }, 400);
  }

  // Block if already has a pending proposal from this user for this RA
  const existingPending = await db
    .select()
    .from(raProposals)
    .where(
      and(
        eq(raProposals.raId, ra.id),
        eq(raProposals.authorId, session.userId),
        eq(raProposals.status, "pending"),
      ),
    )
    .limit(1);

  if (existingPending.length > 0) {
    return c.json({ error: "You already have a pending proposal for this risk assessment." }, 409);
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(raProposals).values({
    id,
    toolRecordId: body.toolRecordId,
    raId: ra.id,
    proposedContentJson: JSON.stringify(body.proposedContent),
    authorId: session.userId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(raProposals)
    .where(eq(raProposals.id, id))
    .limit(1);

  return c.json({ ...created, proposedContent: body.proposedContent }, 201);
});

// ── PUT /:id/approve — Approve RA proposal (Team_Leader+ or Approver/Admin) ──

raProposalsApp.put("/:id/approve", requireRole("Viewer"), async (c) => {
  const id = c.req.param("id");
  const session = c.get("session");

  if (!canReview(session.permissionLevel, session.groupLevel)) {
    return c.json({ error: "Insufficient permissions to approve RA proposals." }, 403);
  }

  const db = drizzle(c.env.DB);

  const [proposal] = await db
    .select()
    .from(raProposals)
    .where(eq(raProposals.id, id))
    .limit(1);

  if (!proposal) return c.json({ error: "RA proposal not found" }, 404);
  if (proposal.status !== "pending") return c.json({ error: "Only pending proposals can be approved." }, 400);

  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE risk_assessments SET content_json = ?, updated_at = ? WHERE id = ?",
    ).bind(proposal.proposedContentJson, now, proposal.raId),
    c.env.DB.prepare(
      "UPDATE ra_proposals SET status = 'approved', reviewer_id = ?, updated_at = ? WHERE id = ?",
    ).bind(session.userId, now, id),
  ]);

  const [updated] = await db
    .select()
    .from(raProposals)
    .where(eq(raProposals.id, id))
    .limit(1);

  return c.json(updated);
});

// ── PUT /:id/reject — Reject RA proposal (Team_Leader+ or Approver/Admin) ──

raProposalsApp.put("/:id/reject", requireRole("Viewer"), async (c) => {
  const id = c.req.param("id");
  const session = c.get("session");
  const body = await c.req.json<{ reason?: string }>();

  if (!canReview(session.permissionLevel, session.groupLevel)) {
    return c.json({ error: "Insufficient permissions to reject RA proposals." }, 403);
  }

  const db = drizzle(c.env.DB);

  const [proposal] = await db
    .select()
    .from(raProposals)
    .where(eq(raProposals.id, id))
    .limit(1);

  if (!proposal) return c.json({ error: "RA proposal not found" }, 404);
  if (proposal.status !== "pending") return c.json({ error: "Only pending proposals can be rejected." }, 400);

  const now = Math.floor(Date.now() / 1000);

  await db
    .update(raProposals)
    .set({
      status: "rejected",
      rejectionReason: body.reason ?? null,
      reviewerId: session.userId,
      updatedAt: now,
    })
    .where(eq(raProposals.id, id));

  const [updated] = await db
    .select()
    .from(raProposals)
    .where(eq(raProposals.id, id))
    .limit(1);

  return c.json(updated);
});

export default raProposalsApp;
