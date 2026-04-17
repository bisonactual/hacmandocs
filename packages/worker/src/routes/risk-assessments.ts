import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { riskAssessments, toolRecords, toolTrainers, areaLeaders } from "../db/schema";
import { requireAdminOrManager } from "../middleware/rbac";
import type { RiskAssessmentContent } from "@hacmandocs/shared";

const raApp = new Hono<Env>();

// ── Group level helpers ───────────────────────────────────────────────

const GROUP_RANK: Record<string, number> = {
  Non_Member: 0,
  Member: 1,
  Team_Leader: 2,
  Manager: 3,
  Board_Member: 4,
};

function isTeamLeaderPlus(groupLevel: string): boolean {
  return (GROUP_RANK[groupLevel] ?? 0) >= GROUP_RANK.Team_Leader;
}

function isAdminOrManager(permLevel: string, groupLevel: string): boolean {
  return permLevel === "Admin" || groupLevel === "Manager";
}

async function isTrainerForTool(
  db: ReturnType<typeof drizzle>,
  userId: string,
  toolId: string,
  areaId: string | null,
): Promise<boolean> {
  const [assignment] = await db
    .select()
    .from(toolTrainers)
    .where(and(eq(toolTrainers.userId, userId), eq(toolTrainers.toolRecordId, toolId)))
    .limit(1);
  if (assignment) return true;

  if (areaId) {
    const [leader] = await db
      .select()
      .from(areaLeaders)
      .where(and(eq(areaLeaders.userId, userId), eq(areaLeaders.areaId, areaId)))
      .limit(1);
    if (leader) return true;
  }

  return false;
}

function validateContent(c: unknown): { valid: true; content: RiskAssessmentContent } | { valid: false; error: string } {
  if (!c || typeof c !== "object") return { valid: false, error: "content is required" };
  const content = c as Record<string, unknown>;

  if (typeof content.ppeRequired !== "string" || !content.ppeRequired.trim())
    return { valid: false, error: "ppeRequired is required" };
  if (typeof content.beforeStarting !== "string" || !content.beforeStarting.trim())
    return { valid: false, error: "beforeStarting is required" };
  if (!Array.isArray(content.rows) || content.rows.length === 0)
    return { valid: false, error: "at least one row is required" };

  for (let i = 0; i < content.rows.length; i++) {
    const row = content.rows[i] as Record<string, unknown>;
    if (!row.hazard || typeof row.hazard !== "string") return { valid: false, error: `row ${i + 1}: hazard is required` };
    if (!row.who || typeof row.who !== "string") return { valid: false, error: `row ${i + 1}: who is required` };
    if (!row.controls || typeof row.controls !== "string") return { valid: false, error: `row ${i + 1}: controls is required` };
    for (const field of ["likelihood", "severity", "likelihoodWithControls", "severityWithControls"]) {
      const v = row[field];
      if (typeof v !== "number" || v < 1 || v > 5 || !Number.isInteger(v))
        return { valid: false, error: `row ${i + 1}: ${field} must be an integer 1-5` };
    }
    if (!row.id || typeof row.id !== "string") row.id = crypto.randomUUID();
  }

  return {
    valid: true,
    content: {
      inductionRequired: Boolean(content.inductionRequired),
      inductionDetails: typeof content.inductionDetails === "string" ? content.inductionDetails : "",
      ppeRequired: (content.ppeRequired as string).trim(),
      beforeStarting: (content.beforeStarting as string).trim(),
      rows: content.rows as RiskAssessmentContent["rows"],
      createdBy: typeof content.createdBy === "string" ? content.createdBy : "",
      createdDate: typeof content.createdDate === "string" ? content.createdDate : "",
      updatedBy: typeof content.updatedBy === "string" ? content.updatedBy : "",
      updatedDate: typeof content.updatedDate === "string" ? content.updatedDate : "",
      reviewBy: typeof content.reviewBy === "string" ? content.reviewBy : "",
      reviewDate: typeof content.reviewDate === "string" ? content.reviewDate : "",
    },
  };
}

// ── POST /risk-assessments/import ─────────────────────────────────────
// Bulk import from Google Docs export. Admin/Manager only.
// MUST be registered before POST /:toolId to avoid "import" matching as a toolId.

raApp.post("/import", requireAdminOrManager(), async (c) => {
  const body = await c.req.json<{
    riskAssessments?: Array<{ toolName: string; toolId?: string; content: unknown }>;
    toolName?: string;
    toolId?: string;
    content?: unknown;
  }>();

  const db = drizzle(c.env.DB);
  const session = c.get("session");
  const now = Math.floor(Date.now() / 1000);

  const items = body.riskAssessments ?? [{ toolName: body.toolName!, toolId: body.toolId, content: body.content }];

  const results: Array<{ toolName: string; status: "imported" | "updated" | "error"; error?: string }> = [];

  for (const item of items) {
    try {
      const validation = validateContent(item.content);
      if (!validation.valid) {
        results.push({ toolName: item.toolName ?? item.toolId ?? "unknown", status: "error", error: validation.error });
        continue;
      }

      let toolId = item.toolId;
      if (!toolId && item.toolName) {
        const tools = await db.select().from(toolRecords);
        const match = tools.find(
          (t) => t.name.toLowerCase() === item.toolName.toLowerCase(),
        );
        if (!match) {
          results.push({ toolName: item.toolName, status: "error", error: `Tool "${item.toolName}" not found` });
          continue;
        }
        toolId = match.id;
      }

      if (!toolId) {
        results.push({ toolName: "unknown", status: "error", error: "toolId or toolName is required" });
        continue;
      }

      const [existing] = await db
        .select()
        .from(riskAssessments)
        .where(and(eq(riskAssessments.toolRecordId, toolId), isNull(riskAssessments.deletedAt)))
        .limit(1);

      if (existing) {
        await db
          .update(riskAssessments)
          .set({ contentJson: JSON.stringify(validation.content), updatedAt: now })
          .where(eq(riskAssessments.id, existing.id));
        results.push({ toolName: item.toolName ?? toolId, status: "updated" });
      } else {
        await db.insert(riskAssessments).values({
          id: crypto.randomUUID(),
          toolRecordId: toolId,
          contentJson: JSON.stringify(validation.content),
          status: "draft",
          createdBy: session.userId,
          createdAt: now,
          updatedAt: now,
        });
        results.push({ toolName: item.toolName ?? toolId, status: "imported" });
      }
    } catch (e) {
      results.push({ toolName: item.toolName ?? "unknown", status: "error", error: String(e) });
    }
  }

  return c.json({ results });
});

// ── GET /risk-assessments ─────────────────────────────────────────────
// List RA status for all tools (id, toolRecordId, status). Public.

raApp.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: riskAssessments.id,
      toolRecordId: riskAssessments.toolRecordId,
      status: riskAssessments.status,
      updatedAt: riskAssessments.updatedAt,
    })
    .from(riskAssessments)
    .where(isNull(riskAssessments.deletedAt));
  return c.json(rows);
});

// ── GET /risk-assessments/:toolId ─────────────────────────────────────
// Public if published; requires auth to see draft.

raApp.get("/:toolId", async (c) => {
  const toolId = c.req.param("toolId");
  const db = drizzle(c.env.DB);
  const session = c.get("session");

  const [ra] = await db
    .select()
    .from(riskAssessments)
    .where(and(eq(riskAssessments.toolRecordId, toolId), isNull(riskAssessments.deletedAt)))
    .limit(1);

  if (!ra) return c.json({ error: "No risk assessment found for this tool." }, 404);

  if (ra.status === "draft") {
    if (!session) return c.json({ error: "Authentication required to view draft risk assessments." }, 401);
    const [tool] = await db.select().from(toolRecords).where(eq(toolRecords.id, toolId)).limit(1);
    const canViewDraft =
      isAdminOrManager(session.permissionLevel, session.groupLevel) ||
      isTeamLeaderPlus(session.groupLevel) ||
      (tool && await isTrainerForTool(db, session.userId, toolId, tool.areaId ?? null));
    if (!canViewDraft) return c.json({ error: "Insufficient permissions to view draft risk assessment." }, 403);
  }

  return c.json({
    id: ra.id,
    toolRecordId: ra.toolRecordId,
    content: JSON.parse(ra.contentJson) as RiskAssessmentContent,
    status: ra.status,
    createdBy: ra.createdBy,
    publishedBy: ra.publishedBy,
    publishedAt: ra.publishedAt,
    createdAt: ra.createdAt,
    updatedAt: ra.updatedAt,
  });
});

// ── POST /risk-assessments/:toolId ────────────────────────────────────
// Create: trainer for tool (if no published RA exists), OR Admin/Manager.

raApp.post("/:toolId", async (c) => {
  const toolId = c.req.param("toolId");
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  const [tool] = await db.select().from(toolRecords).where(eq(toolRecords.id, toolId)).limit(1);
  if (!tool) return c.json({ error: "Tool not found." }, 404);

  const canCreate =
    isAdminOrManager(session.permissionLevel, session.groupLevel) ||
    (await isTrainerForTool(db, session.userId, toolId, tool.areaId ?? null));
  if (!canCreate) return c.json({ error: "Insufficient permissions to create a risk assessment." }, 403);

  const [existing] = await db
    .select()
    .from(riskAssessments)
    .where(and(eq(riskAssessments.toolRecordId, toolId), isNull(riskAssessments.deletedAt)))
    .limit(1);

  if (existing?.status === "published" && !isAdminOrManager(session.permissionLevel, session.groupLevel) && !isTeamLeaderPlus(session.groupLevel)) {
    return c.json({ error: "A published risk assessment already exists. Team Leader or higher required to replace it." }, 403);
  }
  if (existing) {
    return c.json({ error: "A risk assessment already exists for this tool. Use PUT to update it." }, 409);
  }

  const body = await c.req.json<{ content?: unknown }>();
  const validation = validateContent(body.content);
  if (!validation.valid) return c.json({ error: validation.error }, 400);

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  await db.insert(riskAssessments).values({
    id,
    toolRecordId: toolId,
    contentJson: JSON.stringify(validation.content),
    status: "draft",
    createdBy: session.userId,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id, status: "draft" }, 201);
});

// ── PUT /risk-assessments/:toolId ─────────────────────────────────────
// Update content. Draft: trainer+. Published: Team_Leader+ or Admin/Manager.

raApp.put("/:toolId", async (c) => {
  const toolId = c.req.param("toolId");
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  const [ra] = await db
    .select()
    .from(riskAssessments)
    .where(and(eq(riskAssessments.toolRecordId, toolId), isNull(riskAssessments.deletedAt)))
    .limit(1);

  if (!ra) return c.json({ error: "No risk assessment found for this tool." }, 404);

  const [tool] = await db.select().from(toolRecords).where(eq(toolRecords.id, toolId)).limit(1);

  const isPrivileged = isAdminOrManager(session.permissionLevel, session.groupLevel) || isTeamLeaderPlus(session.groupLevel);
  const isTrainer = tool ? await isTrainerForTool(db, session.userId, toolId, tool.areaId ?? null) : false;

  if (ra.status === "published" && !isPrivileged) {
    return c.json({ error: "Team Leader or higher required to edit a published risk assessment." }, 403);
  }
  if (ra.status === "draft" && !isTrainer && !isPrivileged) {
    return c.json({ error: "Insufficient permissions to edit this risk assessment." }, 403);
  }

  const body = await c.req.json<{ content?: unknown }>();
  const validation = validateContent(body.content);
  if (!validation.valid) return c.json({ error: validation.error }, 400);

  const now = Math.floor(Date.now() / 1000);
  await db
    .update(riskAssessments)
    .set({ contentJson: JSON.stringify(validation.content), updatedAt: now })
    .where(eq(riskAssessments.id, ra.id));

  return c.json({ id: ra.id, status: ra.status });
});

// ── PUT /risk-assessments/:toolId/publish ─────────────────────────────
// Publish a draft RA. Requires Team_Leader+ or Admin/Manager.

raApp.put("/:toolId/publish", async (c) => {
  const toolId = c.req.param("toolId");
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  if (!isAdminOrManager(session.permissionLevel, session.groupLevel) && !isTeamLeaderPlus(session.groupLevel)) {
    return c.json({ error: "Team Leader or higher required to publish a risk assessment." }, 403);
  }

  const [ra] = await db
    .select()
    .from(riskAssessments)
    .where(and(eq(riskAssessments.toolRecordId, toolId), isNull(riskAssessments.deletedAt)))
    .limit(1);

  if (!ra) return c.json({ error: "No risk assessment found for this tool." }, 404);
  if (ra.status === "published") return c.json({ error: "Risk assessment is already published." }, 409);

  const now = Math.floor(Date.now() / 1000);
  await db
    .update(riskAssessments)
    .set({ status: "published", publishedBy: session.userId, publishedAt: now, updatedAt: now })
    .where(eq(riskAssessments.id, ra.id));

  return c.json({ id: ra.id, status: "published" });
});

// ── PUT /risk-assessments/:toolId/unpublish ───────────────────────────
// Revert to draft. Requires Team_Leader+ or Admin/Manager.

raApp.put("/:toolId/unpublish", async (c) => {
  const toolId = c.req.param("toolId");
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  if (!isAdminOrManager(session.permissionLevel, session.groupLevel) && !isTeamLeaderPlus(session.groupLevel)) {
    return c.json({ error: "Team Leader or higher required to unpublish a risk assessment." }, 403);
  }

  const [ra] = await db
    .select()
    .from(riskAssessments)
    .where(and(eq(riskAssessments.toolRecordId, toolId), isNull(riskAssessments.deletedAt)))
    .limit(1);

  if (!ra) return c.json({ error: "No risk assessment found for this tool." }, 404);

  const now = Math.floor(Date.now() / 1000);
  await db
    .update(riskAssessments)
    .set({ status: "draft", updatedAt: now })
    .where(eq(riskAssessments.id, ra.id));

  return c.json({ id: ra.id, status: "draft" });
});

// ── DELETE /risk-assessments/:toolId ─────────────────────────────────
// Soft-delete. Requires Team_Leader+ or Admin/Manager.

raApp.delete("/:toolId", async (c) => {
  const toolId = c.req.param("toolId");
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  if (!isAdminOrManager(session.permissionLevel, session.groupLevel) && !isTeamLeaderPlus(session.groupLevel)) {
    return c.json({ error: "Team Leader or higher required to delete a risk assessment." }, 403);
  }

  const [ra] = await db
    .select()
    .from(riskAssessments)
    .where(and(eq(riskAssessments.toolRecordId, toolId), isNull(riskAssessments.deletedAt)))
    .limit(1);

  if (!ra) return c.json({ error: "No risk assessment found for this tool." }, 404);

  const now = Math.floor(Date.now() / 1000);
  await db
    .update(riskAssessments)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(riskAssessments.id, ra.id));

  return c.json({ success: true });
});

export default raApp;
