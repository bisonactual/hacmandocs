import { Hono } from "hono";
import { eq, and, or, lte, gt, isNotNull, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireAdminOrManager } from "../middleware/rbac";
import { requireTrainer } from "../middleware/rbac";
import {
  users,
  toolRecords,
  quizzes,
  questions,
  certifications,
  quizAttempts,
  inductionChecklists,
  inductionChecklistItems,
  inductionSignoffs,
  toolAreas,
  toolTrainers,
  areaLeaders,
  documents,
} from "../db/schema";
import { validateToolRecord, validateQuestion, partitionMemberTools } from "../services/induction-validators";
import { recalculateExpiry, createCertification, getCertificationStatus } from "../services/certification";
import { scoreAttempt } from "../services/quiz-scoring";
import { validateSignoff, validateChecklistSection, validateChecklistItem } from "../services/signoff-validators";
import { requireToolAccess, requireAreaAccess } from "../middleware/tool-access";
import { ensureDocsPage, syncRename, releaseDocsPage, syncDescription } from "../services/tool-docs";

const inductionsApp = new Hono<Env>();

// ── Tool Record CRUD ─────────────────────────────────────────────────

/**
 * GET /tools — List all tool records (any authenticated user).
 */
inductionsApp.get("/tools", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(toolRecords);
  return c.json(rows);
});

/**
 * POST /tools — Create a tool record (Admin only).
 */
inductionsApp.post("/tools", requireAdminOrManager(), async (c) => {
  const body = await c.req.json<{
    name?: string;
    imageUrl?: string | null;
    quizId?: string | null;
    preInductionQuizId?: string | null;
    refresherQuizId?: string | null;
    retrainingIntervalDays?: number | null;
    areaId?: string | null;
    noInductionNeeded?: boolean;
  }>();

  const validation = validateToolRecord(body);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const toolId = crypto.randomUUID();

  try {
    await db.insert(toolRecords).values({
      id: toolId,
      name: body.name!.trim(),
      imageUrl: body.imageUrl ?? null,
      quizId: body.quizId ?? null,
      preInductionQuizId: body.preInductionQuizId ?? null,
      refresherQuizId: body.refresherQuizId ?? null,
      retrainingIntervalDays: body.retrainingIntervalDays ?? null,
      areaId: body.areaId ?? null,
      noInductionNeeded: body.noInductionNeeded ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json(
        { error: "A tool record with this name already exists." },
        409,
      );
    }
    throw err;
  }

  // Auto-create docs page (non-blocking) — requires an area
  if (body.areaId) {
    try {
      let quizDescription: string | null = null;
      if (body.quizId) {
        const [quiz] = await db
          .select({ description: quizzes.description })
          .from(quizzes)
          .where(eq(quizzes.id, body.quizId))
          .limit(1);
        quizDescription = quiz?.description ?? null;
      }
      const [area] = await db
        .select({ name: toolAreas.name })
        .from(toolAreas)
        .where(eq(toolAreas.id, body.areaId))
        .limit(1);
      if (area) {
        const session = c.get("session");
        const docPageId = await ensureDocsPage({
          db: c.env.DB,
          toolId,
          toolName: body.name!.trim(),
          areaName: area.name,
          quizDescription,
          createdBy: session.userId,
        });
        if (docPageId) {
          await db
            .update(toolRecords)
            .set({ docPageId, updatedAt: Math.floor(Date.now() / 1000) })
            .where(eq(toolRecords.id, toolId));
        }
      }
    } catch (err) {
      console.error("[tool-docs] Failed to create docs page during tool creation:", err);
    }
  }

  return c.json({ success: true }, 201);
});

/**
 * PUT /tools/:id — Update a tool record (Admin only).
 * Recalculates cert expiry if retraining interval changed.
 */
inductionsApp.put("/tools/:id", requireAdminOrManager(), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    imageUrl?: string | null;
    quizId?: string | null;
    preInductionQuizId?: string | null;
    refresherQuizId?: string | null;
    retrainingIntervalDays?: number | null;
    areaId?: string | null;
    noInductionNeeded?: boolean;
  }>();

  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  // Merge existing values with updates for validation
  const merged = {
    name: body.name ?? existing.name,
    imageUrl: body.imageUrl !== undefined ? body.imageUrl : existing.imageUrl,
    quizId: body.quizId !== undefined ? body.quizId : existing.quizId,
    preInductionQuizId: body.preInductionQuizId !== undefined ? body.preInductionQuizId : existing.preInductionQuizId,
    refresherQuizId: body.refresherQuizId !== undefined ? body.refresherQuizId : existing.refresherQuizId,
    retrainingIntervalDays:
      body.retrainingIntervalDays !== undefined
        ? body.retrainingIntervalDays
        : existing.retrainingIntervalDays,
    areaId: body.areaId !== undefined ? body.areaId : existing.areaId,
    noInductionNeeded: body.noInductionNeeded !== undefined ? body.noInductionNeeded : (existing.noInductionNeeded === 1),
  };

  const validation = validateToolRecord(merged);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    await db
      .update(toolRecords)
      .set({
        name: merged.name.trim(),
        imageUrl: merged.imageUrl,
        quizId: merged.quizId,
        preInductionQuizId: merged.preInductionQuizId,
        refresherQuizId: merged.refresherQuizId,
        retrainingIntervalDays: merged.retrainingIntervalDays,
        areaId: merged.areaId,
        noInductionNeeded: merged.noInductionNeeded ? 1 : 0,
        updatedAt: now,
      })
      .where(eq(toolRecords.id, id));
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json(
        { error: "A tool record with this name already exists." },
        409,
      );
    }
    throw err;
  }

  // Recalculate cert expiry if interval changed
  if (
    merged.retrainingIntervalDays != null &&
    existing.retrainingIntervalDays !== merged.retrainingIntervalDays
  ) {
    const certs = await db
      .select()
      .from(certifications)
      .where(eq(certifications.toolRecordId, id));

    for (const cert of certs) {
      const updated = recalculateExpiry(
        {
          id: cert.id,
          userId: cert.userId,
          toolRecordId: cert.toolRecordId,
          quizAttemptId: cert.quizAttemptId,
          signoffId: cert.signoffId,
          completedAt: cert.completedAt,
          expiresAt: cert.expiresAt,
        },
        merged.retrainingIntervalDays,
      );
      await db
        .update(certifications)
        .set({ expiresAt: updated.expiresAt })
        .where(eq(certifications.id, cert.id));
    }
  }

  // Sync docs page rename if name changed and page is linked
  if (merged.name.trim() !== existing.name && existing.docPageId) {
    try {
      await syncRename({
        db: c.env.DB,
        docPageId: existing.docPageId,
        newToolName: merged.name.trim(),
      });
    } catch (err) {
      console.error("[tool-docs] Failed to sync rename for tool docs page:", err);
    }
  }

  // Auto-create docs page if tool has an area but no linked page
  if (merged.areaId && !existing.docPageId) {
    try {
      const [area] = await db
        .select({ name: toolAreas.name })
        .from(toolAreas)
        .where(eq(toolAreas.id, merged.areaId))
        .limit(1);
      if (area) {
        let quizDescription: string | null = null;
        const primaryQuizId = merged.quizId ?? merged.preInductionQuizId;
        if (primaryQuizId) {
          const [quiz] = await db
            .select({ description: quizzes.description })
            .from(quizzes)
            .where(eq(quizzes.id, primaryQuizId))
            .limit(1);
          quizDescription = quiz?.description ?? null;
        }
        const session = c.get("session");
        const docPageId = await ensureDocsPage({
          db: c.env.DB,
          toolId: id,
          toolName: merged.name.trim(),
          areaName: area.name,
          quizDescription,
          createdBy: session.userId,
        });
        if (docPageId) {
          await db
            .update(toolRecords)
            .set({ docPageId, updatedAt: Math.floor(Date.now() / 1000) })
            .where(eq(toolRecords.id, id));
        }
      }
    } catch (err) {
      console.error("[tool-docs] Failed to create docs page during tool update:", err);
    }
  }

  const [updated] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, id))
    .limit(1);

  return c.json(updated);
});

/**
 * DELETE /tools/:id — Delete a tool record (Admin only).
 */
inductionsApp.delete("/tools/:id", requireAdminOrManager(), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  // Release docs page before deleting tool record
  try {
    await releaseDocsPage({
      db: c.env.DB,
      toolId: id,
      docPageId: existing.docPageId,
    });
  } catch (err) {
    console.error("[tool-docs] Failed to release docs page during tool deletion:", err);
  }

  // Delete related records that have FK references to this tool
  await db.delete(toolTrainers).where(eq(toolTrainers.toolRecordId, id));
  await db.delete(certifications).where(eq(certifications.toolRecordId, id));
  await db.delete(inductionSignoffs).where(eq(inductionSignoffs.toolRecordId, id));

  // Delete checklist items before checklists (items reference checklists)
  const checklists = await db
    .select({ id: inductionChecklists.id })
    .from(inductionChecklists)
    .where(eq(inductionChecklists.toolRecordId, id));
  for (const cl of checklists) {
    await db.delete(inductionChecklistItems).where(eq(inductionChecklistItems.checklistId, cl.id));
  }
  await db.delete(inductionChecklists).where(eq(inductionChecklists.toolRecordId, id));

  await db.delete(toolRecords).where(eq(toolRecords.id, id));
  return c.json({ success: true });
});

/**
 * POST /tools/:id/repair-link — Re-run ensureDocsPage for a tool (Admin/Manager only).
 */
inductionsApp.post("/tools/:id/repair-link", requireAdminOrManager(), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [tool] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, id))
    .limit(1);

  if (!tool) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  if (!tool.areaId) {
    return c.json({ error: "Tool must have an area assigned to create a docs page." }, 400);
  }

  try {
    let quizDescription: string | null = null;
    if (tool.quizId) {
      const [quiz] = await db
        .select({ description: quizzes.description })
        .from(quizzes)
        .where(eq(quizzes.id, tool.quizId))
        .limit(1);
      quizDescription = quiz?.description ?? null;
    }
    const [area] = await db
      .select({ name: toolAreas.name })
      .from(toolAreas)
      .where(eq(toolAreas.id, tool.areaId))
      .limit(1);
    if (!area) {
      return c.json({ error: "Tool area not found." }, 400);
    }
    const session = c.get("session");
    const docPageId = await ensureDocsPage({
      db: c.env.DB,
      toolId: id,
      toolName: tool.name,
      areaName: area.name,
      quizDescription,
      createdBy: session.userId,
    });
    if (docPageId) {
      await db
        .update(toolRecords)
        .set({ docPageId, updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(toolRecords.id, id));
    }
    return c.json({ docPageId });
  } catch (err) {
    console.error("[tool-docs] repair-link failed:", err);
    return c.json({ error: "Failed to repair docs link." }, 500);
  }
});

// ── Quiz CRUD ────────────────────────────────────────────────────────

/**
 * GET /quizzes — List all quizzes (any authenticated user).
 */
inductionsApp.get("/quizzes", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      description: quizzes.description,
      showWrongAnswers: quizzes.showWrongAnswers,
      status: quizzes.status,
      createdAt: quizzes.createdAt,
      updatedAt: quizzes.updatedAt,
      questionCount: count(questions.id),
    })
    .from(quizzes)
    .leftJoin(questions, eq(questions.quizId, quizzes.id))
    .groupBy(quizzes.id);
  return c.json(rows);
});

// ── Quiz Import (must be before :id routes) ─────────────────────────

interface ImportQuestion {
  questionText: string;
  questionType: string;
  options: string[];
  correctOptionIndex: number;
  correctOptionIndices?: number[];
}

interface ImportQuiz {
  title: string;
  description?: string;
  questions: ImportQuestion[];
}

/**
 * POST /quizzes/import — Import quiz(zes) from JSON (Admin only).
 */
inductionsApp.post("/quizzes/import", requireAdminOrManager(), async (c) => {
  const body = await c.req.json<ImportQuiz | { quizzes: ImportQuiz[] }>();

  const quizInputs: ImportQuiz[] =
    "quizzes" in body && Array.isArray(body.quizzes)
      ? body.quizzes
      : [body as ImportQuiz];

  if (quizInputs.length === 0) {
    return c.json({ error: "At least one quiz is required." }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const createdIds: string[] = [];

  for (const quizInput of quizInputs) {
    if (!quizInput.title || !quizInput.title.trim()) {
      return c.json({ error: "Quiz title is required." }, 400);
    }

    for (const q of quizInput.questions ?? []) {
      const validation = validateQuestion(q);
      if (!validation.valid) {
        return c.json({ error: validation.error }, 400);
      }
    }

    const quizId = crypto.randomUUID();

    await db.insert(quizzes).values({
      id: quizId,
      title: quizInput.title.trim(),
      description: quizInput.description ?? null,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 0; i < (quizInput.questions ?? []).length; i++) {
      const q = quizInput.questions[i];
      await db.insert(questions).values({
        id: crypto.randomUUID(),
        quizId,
        questionText: q.questionText,
        questionType: q.questionType,
        optionsJson: JSON.stringify(q.options),
        correctOptionIndex: q.questionType === "multi_select" ? (q.correctOptionIndices?.[0] ?? q.correctOptionIndex) : q.correctOptionIndex,
        correctOptionIndicesJson: q.questionType === "multi_select" && q.correctOptionIndices ? JSON.stringify(q.correctOptionIndices) : null,
        sortOrder: i,
      });
    }

    createdIds.push(quizId);
  }

  return c.json({ quizIds: createdIds }, 201);
});

/**
 * GET /quizzes/:id — Get a quiz with its questions.
 */
inductionsApp.get("/quizzes/:id", async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);

  if (!quiz) {
    return c.json({ error: "Quiz not found." }, 404);
  }

  const quizQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, id));

  return c.json({
    ...quiz,
    questions: quizQuestions.map((q) => ({
      ...q,
      options: JSON.parse(q.optionsJson),
    })),
  });
});

/**
 * POST /quizzes — Create a quiz (Admin only).
 */
inductionsApp.post("/quizzes", requireAdminOrManager(), async (c) => {
  const body = await c.req.json<{ title?: string; description?: string; showWrongAnswers?: boolean }>();

  if (!body.title || !body.title.trim()) {
    return c.json({ error: "Quiz title is required." }, 400);
  }

  const db = drizzle(c.env.DB);
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(quizzes).values({
    id,
    title: body.title.trim(),
    description: body.description ?? null,
    showWrongAnswers: body.showWrongAnswers === false ? 0 : 1,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);

  return c.json(created, 201);
});

/**
 * PUT /quizzes/:id — Update quiz title/description (Admin only).
 */
inductionsApp.put("/quizzes/:id", requireAdminOrManager(), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ title?: string; description?: string; showWrongAnswers?: boolean }>();

  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Quiz not found." }, 404);
  }

  const updates: Record<string, unknown> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };

  if (body.title !== undefined) {
    if (!body.title.trim()) {
      return c.json({ error: "Quiz title is required." }, 400);
    }
    updates.title = body.title.trim();
  }

  if (body.description !== undefined) {
    updates.description = body.description;
  }

  if (body.showWrongAnswers !== undefined) {
    updates.showWrongAnswers = body.showWrongAnswers ? 1 : 0;
  }

  await db.update(quizzes).set(updates).where(eq(quizzes.id, id));

  // Sync description to all linked tool docs pages if description changed
  if (body.description !== undefined) {
    try {
      const linkedTools = await db
        .select({ id: toolRecords.id, docPageId: toolRecords.docPageId })
        .from(toolRecords)
        .where(
          and(
            isNotNull(toolRecords.docPageId),
            or(
              eq(toolRecords.quizId, id),
              eq(toolRecords.preInductionQuizId, id),
              eq(toolRecords.refresherQuizId, id),
            ),
          ),
        );

      for (const tool of linkedTools) {
        try {
          await syncDescription({
            db: c.env.DB,
            docPageId: tool.docPageId!,
            quizDescription: body.description ?? null,
          });
        } catch (err) {
          console.error(`[tool-docs] Failed to sync description for tool ${tool.id}, page ${tool.docPageId}:`, err);
        }
      }
    } catch (err) {
      console.error("[tool-docs] Failed to find linked tools for quiz description sync:", err);
    }
  }

  const [updated] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);

  return c.json(updated);
});

/**
 * POST /quizzes/:id/publish — Publish a quiz or info page (Admin only).
 * Rejects if the entry has neither questions nor a description.
 */
inductionsApp.post("/quizzes/:id/publish", requireAdminOrManager(), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);

  if (!quiz) {
    return c.json({ error: "Quiz not found." }, 404);
  }

  if (quiz.status !== "draft") {
    return c.json({ error: "Only draft entries can be published." }, 400);
  }

  const quizQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, id));

  const hasDescription = quiz.description && quiz.description.trim().length > 0;

  if (quizQuestions.length === 0 && !hasDescription) {
    return c.json(
      { error: "Cannot publish an entry with no questions and no description. Add questions for a quiz, or a description for an info page." },
      400,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  await db
    .update(quizzes)
    .set({ status: "published", updatedAt: now })
    .where(eq(quizzes.id, id));

  const [updated] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);

  return c.json(updated);
});

/**
 * POST /quizzes/:id/archive — Archive a quiz (Admin only).
 */
inductionsApp.post("/quizzes/:id/archive", requireAdminOrManager(), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);

  if (!quiz) {
    return c.json({ error: "Quiz not found." }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  await db
    .update(quizzes)
    .set({ status: "archived", updatedAt: now })
    .where(eq(quizzes.id, id));

  const [updated] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);

  return c.json(updated);
});

// ── Question CRUD ────────────────────────────────────────────────────

/**
 * GET /quizzes/:id/questions — List questions for a quiz.
 */
inductionsApp.get("/quizzes/:id/questions", async (c) => {
  const quizId = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quiz) {
    return c.json({ error: "Quiz not found." }, 404);
  }

  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId));

  return c.json(
    rows.map((q) => ({
      ...q,
      options: JSON.parse(q.optionsJson),
    })),
  );
});

/**
 * POST /quizzes/:id/questions — Add a question to a quiz (Admin only).
 */
inductionsApp.post(
  "/quizzes/:id/questions",
  requireAdminOrManager(),
  async (c) => {
    const quizId = c.req.param("id");
    const body = await c.req.json<{
      questionText?: string;
      questionType?: string;
      options?: string[];
      correctOptionIndex?: number;
      correctOptionIndices?: number[];
    }>();

    const validation = validateQuestion(body);
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }

    const db = drizzle(c.env.DB);

    const [quiz] = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      return c.json({ error: "Quiz not found." }, 404);
    }

    // Get current max sort order
    const existingQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.quizId, quizId));

    const maxSort = existingQuestions.reduce(
      (max, q) => Math.max(max, q.sortOrder),
      -1,
    );

    const id = crypto.randomUUID();

    await db.insert(questions).values({
      id,
      quizId,
      questionText: body.questionText!,
      questionType: body.questionType!,
      optionsJson: JSON.stringify(body.options!),
      correctOptionIndex: body.questionType === "multi_select" ? (body.correctOptionIndices?.[0] ?? 0) : body.correctOptionIndex!,
      correctOptionIndicesJson: body.questionType === "multi_select" && body.correctOptionIndices ? JSON.stringify(body.correctOptionIndices) : null,
      sortOrder: maxSort + 1,
    });

    const [created] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);

    return c.json(
      { ...created, options: JSON.parse(created.optionsJson) },
      201,
    );
  },
);

/**
 * PUT /quizzes/:quizId/questions/:questionId — Update a question (Admin only).
 * Rejects if the quiz is published.
 */
inductionsApp.put(
  "/quizzes/:quizId/questions/:questionId",
  requireAdminOrManager(),
  async (c) => {
    const quizId = c.req.param("quizId");
    const questionId = c.req.param("questionId");

    const db = drizzle(c.env.DB);

    const [quiz] = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      return c.json({ error: "Quiz not found." }, 404);
    }

    if (quiz.status === "published") {
      return c.json(
        {
          error:
            "Cannot modify questions on a published quiz. You may add new questions.",
        },
        400,
      );
    }

    const [existing] = await db
      .select()
      .from(questions)
      .where(
        and(eq(questions.id, questionId), eq(questions.quizId, quizId)),
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: "Question not found." }, 404);
    }

    const body = await c.req.json<{
      questionText?: string;
      questionType?: string;
      options?: string[];
      correctOptionIndex?: number;
      correctOptionIndices?: number[];
    }>();

    // Merge with existing for validation
    const existingCorrectIndices = existing.correctOptionIndicesJson
      ? JSON.parse(existing.correctOptionIndicesJson) as number[]
      : undefined;
    const merged = {
      questionText: body.questionText ?? existing.questionText,
      questionType: body.questionType ?? existing.questionType,
      options: body.options ?? JSON.parse(existing.optionsJson),
      correctOptionIndex:
        body.correctOptionIndex ?? existing.correctOptionIndex,
      correctOptionIndices:
        body.correctOptionIndices ?? existingCorrectIndices,
    };

    const validation = validateQuestion(merged);
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }

    await db
      .update(questions)
      .set({
        questionText: merged.questionText,
        questionType: merged.questionType,
        optionsJson: JSON.stringify(merged.options),
        correctOptionIndex: merged.questionType === "multi_select" ? (merged.correctOptionIndices?.[0] ?? 0) : merged.correctOptionIndex,
        correctOptionIndicesJson: merged.questionType === "multi_select" && merged.correctOptionIndices ? JSON.stringify(merged.correctOptionIndices) : null,
      })
      .where(
        and(eq(questions.id, questionId), eq(questions.quizId, quizId)),
      );

    const [updated] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1);

    return c.json({ ...updated, options: JSON.parse(updated.optionsJson) });
  },
);

/**
 * DELETE /quizzes/:quizId/questions/:questionId — Delete a question (Admin only).
 * Rejects if the quiz is published.
 */
inductionsApp.delete(
  "/quizzes/:quizId/questions/:questionId",
  requireAdminOrManager(),
  async (c) => {
    const quizId = c.req.param("quizId");
    const questionId = c.req.param("questionId");

    const db = drizzle(c.env.DB);

    const [quiz] = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      return c.json({ error: "Quiz not found." }, 404);
    }

    if (quiz.status === "published") {
      return c.json(
        {
          error:
            "Cannot modify questions on a published quiz. You may add new questions.",
        },
        400,
      );
    }

    const [existing] = await db
      .select()
      .from(questions)
      .where(
        and(eq(questions.id, questionId), eq(questions.quizId, quizId)),
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: "Question not found." }, 404);
    }

    await db
      .delete(questions)
      .where(
        and(eq(questions.id, questionId), eq(questions.quizId, quizId)),
      );

    return c.json({ success: true });
  },
);

// ── Quiz Attempt Submission ───────────────────────────────────────────

/**
 * POST /quizzes/:id/attempt — Submit a quiz attempt (any authenticated user).
 * Scores the attempt, records it, and creates a certification on pass.
 */
inductionsApp.post("/quizzes/:id/attempt", async (c) => {
  const quizId = c.req.param("id");
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  // Fetch quiz
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quiz) {
    return c.json({ error: "Quiz not found." }, 404);
  }

  if (quiz.status !== "published") {
    return c.json({ error: "This quiz is not currently available." }, 400);
  }

  // Fetch questions
  const quizQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId));

  const body = await c.req.json<{ answers?: (number | number[])[] }>();

  if (!body.answers || !Array.isArray(body.answers)) {
    return c.json({ error: "Please answer all questions before submitting." }, 400);
  }

  if (body.answers.length !== quizQuestions.length) {
    return c.json({ error: "Please answer all questions before submitting." }, 400);
  }

  // Validate answer indices are within bounds
  for (let i = 0; i < body.answers.length; i++) {
    const answer = body.answers[i];
    const opts: string[] = JSON.parse(quizQuestions[i].optionsJson);
    const isMultiSelect = quizQuestions[i].questionType === "multi_select";

    if (isMultiSelect) {
      // Multi-select: answer should be an array of indices
      if (!Array.isArray(answer)) {
        return c.json({ error: "Invalid answer selection." }, 400);
      }
      for (const idx of answer) {
        if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= opts.length) {
          return c.json({ error: "Invalid answer selection." }, 400);
        }
      }
    } else {
      // Single answer: must be a number
      if (typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= opts.length) {
        return c.json({ error: "Invalid answer selection." }, 400);
      }
    }
  }

  // Score the attempt
  const result = scoreAttempt(quizQuestions, body.answers);

  const now = Math.floor(Date.now() / 1000);
  const attemptId = crypto.randomUUID();

  // Record the attempt
  await db.insert(quizAttempts).values({
    id: attemptId,
    quizId,
    userId: session.userId,
    answersJson: JSON.stringify(body.answers),
    score: result.score,
    passed: result.passed ? 1 : 0,
    createdAt: now,
  });

  let certificationId: string | undefined;
  let passedToolName: string | undefined;
  let quizRole: 'online_induction' | 'pre_induction' | 'refresher' | null = null;

  if (result.passed) {
    // Find the tool record associated with this quiz (check all quiz fields)
    const allTools = await db.select().from(toolRecords);
    const toolRecord = allTools.find(
      (t) => t.quizId === quizId || t.preInductionQuizId === quizId || t.refresherQuizId === quizId,
    );

    if (toolRecord) {
      passedToolName = toolRecord.name;

      // Determine which role this quiz plays for the tool
      if (toolRecord.quizId === quizId) {
        quizRole = 'online_induction';
      } else if (toolRecord.preInductionQuizId === quizId) {
        quizRole = 'pre_induction';
      } else if (toolRecord.refresherQuizId === quizId) {
        quizRole = 'refresher';
      }

      // Pre-induction quizzes do NOT create a certification (just record the pass)
      // Online induction and refresher quizzes DO create a certification
      if (quizRole !== 'pre_induction') {
        const certData = createCertification(
          session.userId,
          {
            id: toolRecord.id,
            retrainingIntervalDays: toolRecord.retrainingIntervalDays,
          },
          attemptId,
          now,
        );

        certificationId = crypto.randomUUID();

        await db.insert(certifications).values({
          id: certificationId,
          ...certData,
        });
      }
    }
  }

  const response: Record<string, unknown> = {
    score: result.score,
    passed: result.passed,
    correctCount: result.correctCount,
    totalCount: result.totalCount,
  };

  if (result.passed && certificationId) {
    response.certificationId = certificationId;
  }
  if (passedToolName) {
    response.toolName = passedToolName;
  }
  if (quizRole) {
    response.quizRole = quizRole;
  }

  if (!result.passed) {
    response.message = "You did not pass. Please retake the quiz.";

    // Include wrong question indices if the quiz has showWrongAnswers enabled
    if (quiz.showWrongAnswers) {
      const wrongQuestionIndices: number[] = [];
      for (let i = 0; i < quizQuestions.length; i++) {
        const q = quizQuestions[i];
        const answer = body.answers[i];
        let isCorrect: boolean;

        if (q.questionType === "multi_select") {
          const selected = Array.isArray(answer) ? [...answer].sort() : [answer];
          const correct = q.correctOptionIndicesJson
            ? (JSON.parse(q.correctOptionIndicesJson) as number[]).sort()
            : [q.correctOptionIndex];
          isCorrect = selected.length === correct.length && selected.every((v, idx) => v === correct[idx]);
        } else {
          const selected = Array.isArray(answer) ? answer[0] : answer;
          isCorrect = selected === q.correctOptionIndex;
        }

        if (!isCorrect) {
          wrongQuestionIndices.push(i);
        }
      }
      response.wrongQuestionIndices = wrongQuestionIndices;
      response.wrongQuestionTexts = wrongQuestionIndices.map((i) => quizQuestions[i].questionText);
    }
  }

  return c.json(response);
});

// ── Certification & Attempt History ──────────────────────────────────

/**
 * GET /certifications/me — Get current user's certifications with computed status.
 */
inductionsApp.get("/certifications/me", async (c) => {
  const session = c.get("session");
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  const certs = await db
    .select()
    .from(certifications)
    .where(eq(certifications.userId, session.userId));

  return c.json(
    certs.map((cert) => ({
      ...cert,
      status: getCertificationStatus(
        { expiresAt: cert.expiresAt },
        now,
      ),
    })),
  );
});

/**
 * GET /attempts/me — Get current user's attempt history.
 */
inductionsApp.get("/attempts/me", async (c) => {
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  const attempts = await db
    .select()
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, session.userId));

  return c.json(
    attempts.map((a) => ({
      ...a,
      passed: a.passed === 1,
      answersJson: JSON.parse(a.answersJson),
    })),
  );
});

/**
 * GET /profile/me — Get member profile data (available, completed, expired, noInductionNeeded tools).
 */
inductionsApp.get("/profile/me", async (c) => {
  const session = c.get("session");
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  // Left-join documents to get isPublished for each tool's docPageId
  const allToolRows = await db
    .select({
      id: toolRecords.id,
      name: toolRecords.name,
      imageUrl: toolRecords.imageUrl,
      quizId: toolRecords.quizId,
      preInductionQuizId: toolRecords.preInductionQuizId,
      refresherQuizId: toolRecords.refresherQuizId,
      retrainingIntervalDays: toolRecords.retrainingIntervalDays,
      areaId: toolRecords.areaId,
      docPageId: toolRecords.docPageId,
      noInductionNeeded: toolRecords.noInductionNeeded,
      createdAt: toolRecords.createdAt,
      updatedAt: toolRecords.updatedAt,
      docIsPublished: documents.isPublished,
    })
    .from(toolRecords)
    .leftJoin(documents, eq(toolRecords.docPageId, documents.id));

  // Fetch all tool areas for areaId → areaName mapping
  const allAreas = await db.select().from(toolAreas);
  const areaMap = new Map(allAreas.map((a) => [a.id, a.name]));

  const userCerts = await db
    .select()
    .from(certifications)
    .where(eq(certifications.userId, session.userId));

  // Get user's passed quiz attempts to determine pre-induction status
  const userAttempts = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.userId, session.userId), eq(quizAttempts.passed, 1)));

  // Build a lookup from tool id to the extra fields (docPageId, docPagePublished, noInductionNeeded, areaName)
  const toolExtras = new Map(
    allToolRows.map((tr) => [
      tr.id,
      {
        docPageId: tr.docPageId,
        docPagePublished: tr.docIsPublished === 1,
        noInductionNeeded: tr.noInductionNeeded === 1,
        areaId: tr.areaId,
        areaName: tr.areaId ? (areaMap.get(tr.areaId) ?? null) : null,
      },
    ]),
  );

  // Build tool records in the shape partitionMemberTools expects
  const toolRecordsForPartition = allToolRows.map((tr) => ({
    id: tr.id,
    name: tr.name,
    imageUrl: tr.imageUrl,
    quizId: tr.quizId,
    preInductionQuizId: tr.preInductionQuizId,
    refresherQuizId: tr.refresherQuizId,
    retrainingIntervalDays: tr.retrainingIntervalDays,
    areaId: tr.areaId,
    createdAt: tr.createdAt,
    updatedAt: tr.updatedAt,
  }));

  const partition = partitionMemberTools(
    toolRecordsForPartition,
    userCerts.map((cert) => ({
      id: cert.id,
      userId: cert.userId,
      toolRecordId: cert.toolRecordId,
      quizAttemptId: cert.quizAttemptId,
      signoffId: cert.signoffId,
      completedAt: cert.completedAt,
      expiresAt: cert.expiresAt,
    })),
    now,
  );

  // Build cert lookup for enriching completed/expired tools
  const certsByTool = new Map<string, typeof userCerts>();
  for (const cert of userCerts) {
    const existing = certsByTool.get(cert.toolRecordId) ?? [];
    existing.push(cert);
    certsByTool.set(cert.toolRecordId, existing);
  }

  // Build set of passed quiz IDs for pre-induction status
  const passedQuizIds = new Set(userAttempts.map((a) => a.quizId));

  // Set of tool IDs that have certifications (for noInductionNeeded filtering)
  const toolIdsWithCerts = new Set(userCerts.map((c) => c.toolRecordId));

  // Separate noInductionNeeded tools from the available list
  const noInductionNeededTools = partition.available.filter(
    (t) => toolExtras.get(t.id)?.noInductionNeeded && !toolIdsWithCerts.has(t.id),
  );
  const noInductionIds = new Set(noInductionNeededTools.map((t) => t.id));
  const availableTools = partition.available.filter((t) => !noInductionIds.has(t.id));

  const enrichTool = (t: { id: string }) => {
    const extras = toolExtras.get(t.id);
    return {
      docPageId: extras?.docPageId ?? null,
      docPagePublished: extras?.docPagePublished ?? false,
      noInductionNeeded: extras?.noInductionNeeded ?? false,
      areaId: extras?.areaId ?? null,
      areaName: extras?.areaName ?? null,
    };
  };

  return c.json({
    available: availableTools.map((t) => ({
      id: t.id,
      name: t.name,
      quizId: t.quizId,
      preInductionQuizId: t.preInductionQuizId,
      refresherQuizId: t.refresherQuizId,
      retrainingIntervalDays: t.retrainingIntervalDays,
      passedPreInduction: t.preInductionQuizId ? passedQuizIds.has(t.preInductionQuizId) : false,
      ...enrichTool(t),
    })),
    completed: partition.completed.map((t) => {
      const certs = certsByTool.get(t.id) ?? [];
      const latestCert = certs.sort((a, b) => b.completedAt - a.completedAt)[0];
      return {
        id: t.id,
        name: t.name,
        quizId: t.quizId,
        refresherQuizId: t.refresherQuizId,
        retrainingIntervalDays: t.retrainingIntervalDays,
        certification: latestCert
          ? {
              id: latestCert.id,
              completedAt: latestCert.completedAt,
              expiresAt: latestCert.expiresAt,
              status: getCertificationStatus(
                { expiresAt: latestCert.expiresAt },
                now,
              ),
            }
          : null,
        ...enrichTool(t),
      };
    }),
    expired: partition.expired.map((t) => {
      const certs = certsByTool.get(t.id) ?? [];
      const latestCert = certs.sort((a, b) => b.completedAt - a.completedAt)[0];
      return {
        id: t.id,
        name: t.name,
        quizId: t.quizId,
        refresherQuizId: t.refresherQuizId,
        retrainingIntervalDays: t.retrainingIntervalDays,
        certification: latestCert
          ? {
              id: latestCert.id,
              completedAt: latestCert.completedAt,
              expiresAt: latestCert.expiresAt,
              status: getCertificationStatus(
                { expiresAt: latestCert.expiresAt },
                now,
              ),
            }
          : null,
        ...enrichTool(t),
      };
    }),
    noInductionNeeded: noInductionNeededTools.map((t) => ({
      id: t.id,
      name: t.name,
      ...enrichTool(t),
    })),
  });
});

// ── Trainer Dashboard ────────────────────────────────────────────────

const DAY_SECONDS = 86400;

/**
 * GET /trainer/completions — Members with active certifications.
 */
inductionsApp.get("/trainer/completions", requireTrainer(), async (c) => {
  const db = drizzle(c.env.DB);

  const rows = await db
    .select({
      userId: users.id,
      memberName: users.name,
      toolName: toolRecords.name,
      toolRecordId: toolRecords.id,
      completedAt: certifications.completedAt,
      certificationId: certifications.id,
    })
    .from(certifications)
    .innerJoin(users, eq(certifications.userId, users.id))
    .innerJoin(toolRecords, eq(certifications.toolRecordId, toolRecords.id));

  return c.json(rows);
});

/**
 * GET /trainer/expired — Members with expired refresher certs.
 */
inductionsApp.get("/trainer/expired", requireTrainer(), async (c) => {
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  const rows = await db
    .select({
      userId: users.id,
      memberName: users.name,
      toolName: toolRecords.name,
      toolRecordId: toolRecords.id,
      expiresAt: certifications.expiresAt,
      certificationId: certifications.id,
    })
    .from(certifications)
    .innerJoin(users, eq(certifications.userId, users.id))
    .innerJoin(toolRecords, eq(certifications.toolRecordId, toolRecords.id))
    .where(lte(certifications.expiresAt, now));

  return c.json(
    rows.map((r) => ({
      ...r,
      daysSinceExpiry: Math.floor((now - r.expiresAt!) / DAY_SECONDS),
    })),
  );
});

/**
 * GET /trainer/expiring — Members with certs expiring within 30 days.
 */
inductionsApp.get("/trainer/expiring", requireTrainer(), async (c) => {
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysFromNow = now + 30 * DAY_SECONDS;

  const rows = await db
    .select({
      userId: users.id,
      memberName: users.name,
      toolName: toolRecords.name,
      toolRecordId: toolRecords.id,
      expiresAt: certifications.expiresAt,
      certificationId: certifications.id,
    })
    .from(certifications)
    .innerJoin(users, eq(certifications.userId, users.id))
    .innerJoin(toolRecords, eq(certifications.toolRecordId, toolRecords.id))
    .where(
      and(
        gt(certifications.expiresAt, now),
        lte(certifications.expiresAt, thirtyDaysFromNow),
      ),
    );

  return c.json(
    rows.map((r) => ({
      ...r,
      daysRemaining: Math.floor((r.expiresAt! - now) / DAY_SECONDS),
    })),
  );
});

/**
 * GET /trainer/tools/:id — All members for a specific tool with cert status.
 */
inductionsApp.get("/trainer/tools/:id", requireTrainer(), async (c) => {
  const toolId = c.req.param("id");
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  const [tool] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, toolId))
    .limit(1);

  if (!tool) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  const rows = await db
    .select({
      userId: users.id,
      memberName: users.name,
      memberEmail: users.email,
      certificationId: certifications.id,
      completedAt: certifications.completedAt,
      expiresAt: certifications.expiresAt,
    })
    .from(certifications)
    .innerJoin(users, eq(certifications.userId, users.id))
    .where(eq(certifications.toolRecordId, toolId));

  return c.json({
    tool: { id: tool.id, name: tool.name },
    members: rows.map((r) => ({
      ...r,
      status: getCertificationStatus({ expiresAt: r.expiresAt }, now),
    })),
  });
});

/**
 * GET /trainer/members/:id — All certs for a specific member.
 */
inductionsApp.get("/trainer/members/:id", requireTrainer(), async (c) => {
  const memberId = c.req.param("id");
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  const [member] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, memberId))
    .limit(1);

  if (!member) {
    return c.json({ error: "Member not found." }, 404);
  }

  const rows = await db
    .select({
      certificationId: certifications.id,
      toolRecordId: toolRecords.id,
      toolName: toolRecords.name,
      completedAt: certifications.completedAt,
      expiresAt: certifications.expiresAt,
    })
    .from(certifications)
    .innerJoin(toolRecords, eq(certifications.toolRecordId, toolRecords.id))
    .where(eq(certifications.userId, memberId));

  return c.json({
    member,
    certifications: rows.map((r) => ({
      ...r,
      status: getCertificationStatus({ expiresAt: r.expiresAt }, now),
    })),
  });
});

/**
 * GET /trainer/search — Filter/search by name, tool, status, type.
 * Query params: ?name=&tool=&status=&type= (type: 'quiz' | 'signoff' | omit for all)
 */
inductionsApp.get("/trainer/search", requireTrainer(), async (c) => {
  const nameFilter = c.req.query("name");
  const toolFilter = c.req.query("tool");
  const statusFilter = c.req.query("status");
  const typeFilter = c.req.query("type");
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  // Quiz-based certifications
  const certRows = await db
    .select({
      userId: users.id,
      memberName: users.name,
      memberEmail: users.email,
      certificationId: certifications.id,
      toolRecordId: toolRecords.id,
      toolName: toolRecords.name,
      completedAt: certifications.completedAt,
      expiresAt: certifications.expiresAt,
    })
    .from(certifications)
    .innerJoin(users, eq(certifications.userId, users.id))
    .innerJoin(toolRecords, eq(certifications.toolRecordId, toolRecords.id));

  let results: Array<{
    userId: string;
    memberName: string;
    memberEmail: string;
    certificationId: string | null;
    toolRecordId: string;
    toolName: string;
    completedAt: number;
    expiresAt: number | null;
    status: string;
    source: 'quiz' | 'signoff';
    inducteeUsername?: string;
  }> = certRows.map((r) => ({
    ...r,
    status: getCertificationStatus({ expiresAt: r.expiresAt }, now),
    source: 'quiz' as const,
  }));

  // Signoff-based records (include even if no certification was created)
  const signoffRows = await db
    .select({
      signoffId: inductionSignoffs.id,
      toolRecordId: inductionSignoffs.toolRecordId,
      toolName: toolRecords.name,
      inducteeFullName: inductionSignoffs.inducteeFullName,
      inducteeUsername: inductionSignoffs.inducteeUsername,
      inducteeUserId: inductionSignoffs.inducteeUserId,
      signedAt: inductionSignoffs.signedAt,
    })
    .from(inductionSignoffs)
    .innerJoin(toolRecords, eq(inductionSignoffs.toolRecordId, toolRecords.id));

  for (const s of signoffRows) {
    results.push({
      userId: s.inducteeUserId ?? '',
      memberName: s.inducteeFullName,
      memberEmail: '',
      certificationId: null,
      toolRecordId: s.toolRecordId,
      toolName: s.toolName,
      completedAt: s.signedAt,
      expiresAt: null,
      status: 'active',
      source: 'signoff',
      inducteeUsername: s.inducteeUsername,
    });
  }

  if (typeFilter) {
    results = results.filter((r) => r.source === typeFilter);
  }

  if (nameFilter) {
    const lower = nameFilter.toLowerCase();
    results = results.filter((r) => r.memberName.toLowerCase().includes(lower));
  }

  if (toolFilter) {
    const lower = toolFilter.toLowerCase();
    results = results.filter((r) => r.toolName.toLowerCase().includes(lower));
  }

  if (statusFilter) {
    results = results.filter((r) => r.status === statusFilter);
  }

  return c.json(results);
});

/**
 * GET /trainer/attempts — All quiz attempts with member/quiz/tool info.
 */
inductionsApp.get("/trainer/attempts", requireTrainer(), async (c) => {
  const db = drizzle(c.env.DB);

  const rows = await db
    .select({
      attemptId: quizAttempts.id,
      userId: users.id,
      userName: users.name,
      quizId: quizzes.id,
      quizTitle: quizzes.title,
      score: quizAttempts.score,
      passed: quizAttempts.passed,
      createdAt: quizAttempts.createdAt,
    })
    .from(quizAttempts)
    .innerJoin(users, eq(quizAttempts.userId, users.id))
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id));

  // Try to resolve tool name for each quiz
  const allToolRecordRows = await db.select().from(toolRecords);
  const toolByQuizId = new Map<string, string>();
  for (const tr of allToolRecordRows) {
    if (tr.quizId) toolByQuizId.set(tr.quizId, tr.name);
  }

  return c.json(
    rows.map((r) => ({
      ...r,
      passed: r.passed === 1,
      toolName: toolByQuizId.get(r.quizId) ?? null,
    })),
  );
});

// ── Checklist CRUD ───────────────────────────────────────────────────

/**
 * GET /checklists/:toolId — Get full checklist for a tool (all sections + items).
 */
inductionsApp.get("/checklists/:toolId", async (c) => {
  const toolId = c.req.param("toolId");
  const db = drizzle(c.env.DB);

  const [tool] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, toolId))
    .limit(1);

  if (!tool) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  const sections = await db
    .select()
    .from(inductionChecklists)
    .where(eq(inductionChecklists.toolRecordId, toolId));

  const allItems = await db.select().from(inductionChecklistItems);

  const itemsBySection = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const existing = itemsBySection.get(item.checklistId) ?? [];
    existing.push(item);
    itemsBySection.set(item.checklistId, existing);
  }

  const result = sections
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({
      id: s.id,
      sectionTitle: s.sectionTitle,
      sortOrder: s.sortOrder,
      items: (itemsBySection.get(s.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));

  return c.json({ tool: { id: tool.id, name: tool.name }, sections: result });
});

/**
 * POST /checklists/:toolId — Create a checklist section for a tool.
 */
inductionsApp.post("/checklists/:toolId", requireTrainer(), async (c) => {
  const toolId = c.req.param("toolId");
  const body = await c.req.json<{ sectionTitle?: string; sortOrder?: number }>();

  const validation = validateChecklistSection(body);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400);
  }

  const db = drizzle(c.env.DB);

  const [tool] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, toolId))
    .limit(1);

  if (!tool) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  await db.insert(inductionChecklists).values({
    id,
    toolRecordId: toolId,
    sectionTitle: body.sectionTitle!.trim(),
    sortOrder: body.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id, success: true }, 201);
});

/**
 * PUT /checklists/sections/:sectionId — Update a checklist section.
 */
inductionsApp.put("/checklists/sections/:sectionId", requireTrainer(), async (c) => {
  const sectionId = c.req.param("sectionId");
  const body = await c.req.json<{ sectionTitle?: string; sortOrder?: number }>();
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(inductionChecklists)
    .where(eq(inductionChecklists.id, sectionId))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Checklist section not found." }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const updates: Record<string, unknown> = { updatedAt: now };

  if (body.sectionTitle !== undefined) {
    if (!body.sectionTitle.trim()) {
      return c.json({ error: "Section title is required." }, 400);
    }
    updates.sectionTitle = body.sectionTitle.trim();
  }

  if (body.sortOrder !== undefined) {
    updates.sortOrder = body.sortOrder;
  }

  await db
    .update(inductionChecklists)
    .set(updates)
    .where(eq(inductionChecklists.id, sectionId));

  return c.json({ success: true });
});

/**
 * DELETE /checklists/sections/:sectionId — Delete a section and its items.
 */
inductionsApp.delete("/checklists/sections/:sectionId", requireTrainer(), async (c) => {
  const sectionId = c.req.param("sectionId");
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(inductionChecklists)
    .where(eq(inductionChecklists.id, sectionId))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Checklist section not found." }, 404);
  }

  // Delete items first, then the section
  await db
    .delete(inductionChecklistItems)
    .where(eq(inductionChecklistItems.checklistId, sectionId));

  await db
    .delete(inductionChecklists)
    .where(eq(inductionChecklists.id, sectionId));

  return c.json({ success: true });
});

/**
 * POST /checklists/sections/:sectionId/items — Add an item to a section.
 */
inductionsApp.post("/checklists/sections/:sectionId/items", requireTrainer(), async (c) => {
  const sectionId = c.req.param("sectionId");
  const body = await c.req.json<{ itemText?: string; sortOrder?: number }>();

  const validation = validateChecklistItem(body);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400);
  }

  const db = drizzle(c.env.DB);

  const [section] = await db
    .select()
    .from(inductionChecklists)
    .where(eq(inductionChecklists.id, sectionId))
    .limit(1);

  if (!section) {
    return c.json({ error: "Checklist section not found." }, 404);
  }

  const id = crypto.randomUUID();

  await db.insert(inductionChecklistItems).values({
    id,
    checklistId: sectionId,
    itemText: body.itemText!.trim(),
    sortOrder: body.sortOrder ?? 0,
  });

  return c.json({ id, success: true }, 201);
});

/**
 * PUT /checklists/items/:itemId — Update a checklist item.
 */
inductionsApp.put("/checklists/items/:itemId", requireTrainer(), async (c) => {
  const itemId = c.req.param("itemId");
  const body = await c.req.json<{ itemText?: string; sortOrder?: number }>();
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(inductionChecklistItems)
    .where(eq(inductionChecklistItems.id, itemId))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Checklist item not found." }, 404);
  }

  const updates: Record<string, unknown> = {};

  if (body.itemText !== undefined) {
    if (!body.itemText.trim()) {
      return c.json({ error: "Item text is required." }, 400);
    }
    updates.itemText = body.itemText.trim();
  }

  if (body.sortOrder !== undefined) {
    updates.sortOrder = body.sortOrder;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update." }, 400);
  }

  await db
    .update(inductionChecklistItems)
    .set(updates)
    .where(eq(inductionChecklistItems.id, itemId));

  return c.json({ success: true });
});

/**
 * DELETE /checklists/items/:itemId — Delete a checklist item.
 */
inductionsApp.delete("/checklists/items/:itemId", requireTrainer(), async (c) => {
  const itemId = c.req.param("itemId");
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(inductionChecklistItems)
    .where(eq(inductionChecklistItems.id, itemId))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Checklist item not found." }, 404);
  }

  await db
    .delete(inductionChecklistItems)
    .where(eq(inductionChecklistItems.id, itemId));

  return c.json({ success: true });
});

// ── Mark as Trained ──────────────────────────────────────────────────

/**
 * POST /tools/:toolId/mark-trained — Self-service: mark current user as trained.
 * Creates a certification without a quiz or signoff.
 */
inductionsApp.post("/tools/:toolId/mark-trained", async (c) => {
  const session = c.get("session");
  const toolId = c.req.param("toolId");
  const db = drizzle(c.env.DB);

  const [tool] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, toolId))
    .limit(1);

  if (!tool) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  // Check if user already has an active certification for this tool
  const now = Math.floor(Date.now() / 1000);
  const existingCerts = await db
    .select()
    .from(certifications)
    .where(
      and(
        eq(certifications.userId, session.userId),
        eq(certifications.toolRecordId, toolId),
      ),
    );

  const hasActive = existingCerts.some(
    (cert) => getCertificationStatus({ expiresAt: cert.expiresAt }, now) === "active" ||
              getCertificationStatus({ expiresAt: cert.expiresAt }, now) === "expiring_soon",
  );

  if (hasActive) {
    return c.json({ error: "You already have an active certification for this tool." }, 409);
  }

  const certData = createCertification(
    session.userId,
    { id: tool.id, retrainingIntervalDays: tool.retrainingIntervalDays },
    null,
    now,
    'manual',
  );

  const certificationId = crypto.randomUUID();
  await db.insert(certifications).values({
    id: certificationId,
    ...certData,
  });

  return c.json({ certificationId, success: true }, 201);
});

/**
 * POST /trainer/tools/:toolId/mark-trained/:userId — Trainer/admin marks a user as trained.
 */
inductionsApp.post("/trainer/tools/:toolId/mark-trained/:userId", requireTrainer(), async (c) => {
  const toolId = c.req.param("toolId");
  const targetUserId = c.req.param("userId");
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  const [tool] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, toolId))
    .limit(1);

  if (!tool) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  // Verify trainer has access to this tool
  if (session.permissionLevel !== "Admin" && session.groupLevel !== "Manager") {
    let hasAccess = false;
    if (tool.areaId) {
      const [leader] = await db
        .select()
        .from(areaLeaders)
        .where(and(eq(areaLeaders.userId, session.userId), eq(areaLeaders.areaId, tool.areaId)))
        .limit(1);
      if (leader) hasAccess = true;
    }
    if (!hasAccess) {
      const [assignment] = await db
        .select()
        .from(toolTrainers)
        .where(and(eq(toolTrainers.userId, session.userId), eq(toolTrainers.toolRecordId, toolId)))
        .limit(1);
      if (assignment) hasAccess = true;
    }
    if (!hasAccess) {
      return c.json({ error: "You are not authorised for this tool." }, 403);
    }
  }

  // Verify target user exists
  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!targetUser) {
    return c.json({ error: "User not found." }, 404);
  }

  const now = Math.floor(Date.now() / 1000);

  const certData = createCertification(
    targetUserId,
    { id: tool.id, retrainingIntervalDays: tool.retrainingIntervalDays },
    null,
    now,
    'manual',
  );

  const certificationId = crypto.randomUUID();
  await db.insert(certifications).values({
    id: certificationId,
    ...certData,
  });

  return c.json({ certificationId, success: true }, 201);
});

// ── Signoff Routes ───────────────────────────────────────────────────

/**
 * POST /signoff — Submit an electronic induction signoff.
 * Trainer must be authenticated. Looks up inductee by username.
 * If found, creates a certification record for the matched user.
 */
inductionsApp.post("/signoff", requireTrainer(), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{
    toolRecordId?: string;
    inducteeFullName?: string;
    inducteeUsername?: string;
    trainerConfirmed?: boolean;
    inducteeConfirmed?: boolean;
  }>();

  const validation = validateSignoff(body);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400);
  }

  const db = drizzle(c.env.DB);

  // Verify tool exists
  const [tool] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, body.toolRecordId!))
    .limit(1);

  if (!tool) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  // Verify trainer has access to this tool (Admin, area leader, or assigned trainer)
  if (session.permissionLevel !== "Admin" && session.groupLevel !== "Manager") {
    let hasAccess = false;

    // Check area leader
    if (tool.areaId) {
      const [leader] = await db
        .select()
        .from(areaLeaders)
        .where(
          and(
            eq(areaLeaders.userId, session.userId),
            eq(areaLeaders.areaId, tool.areaId),
          ),
        )
        .limit(1);
      if (leader) hasAccess = true;
    }

    // Check direct trainer assignment
    if (!hasAccess) {
      const [assignment] = await db
        .select()
        .from(toolTrainers)
        .where(
          and(
            eq(toolTrainers.userId, session.userId),
            eq(toolTrainers.toolRecordId, body.toolRecordId!),
          ),
        )
        .limit(1);
      if (assignment) hasAccess = true;
    }

    if (!hasAccess) {
      return c.json({ error: "You are not authorised to sign off on this tool." }, 403);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const signoffId = crypto.randomUUID();

  // Look up inductee by username
  const [inducteeUser] = await db
    .select()
    .from(users)
    .where(eq(users.username, body.inducteeUsername!.trim()))
    .limit(1);

  const inducteeUserId = inducteeUser?.id ?? null;

  // Create the signoff record
  await db.insert(inductionSignoffs).values({
    id: signoffId,
    toolRecordId: body.toolRecordId!,
    trainerId: session.userId,
    inducteeFullName: body.inducteeFullName!.trim(),
    inducteeUsername: body.inducteeUsername!.trim(),
    inducteeUserId,
    trainerConfirmed: 1,
    inducteeConfirmed: 1,
    signedAt: now,
    createdAt: now,
  });

  let certificationId: string | undefined;

  // If we matched a user, create a certification
  if (inducteeUserId) {
    const certData = createCertification(
      inducteeUserId,
      {
        id: tool.id,
        retrainingIntervalDays: tool.retrainingIntervalDays,
      },
      signoffId,
      now,
      'signoff',
    );

    certificationId = crypto.randomUUID();

    await db.insert(certifications).values({
      id: certificationId,
      ...certData,
    });
  }

  return c.json({
    id: signoffId,
    certificationId: certificationId ?? null,
    inducteeMatched: inducteeUserId !== null,
    success: true,
  }, 201);
});

/**
 * GET /trainer/signoffs — List all signoffs, searchable.
 * Query params: ?name=&username=&tool=&from=&to=
 */
inductionsApp.get("/trainer/signoffs", requireTrainer(), async (c) => {
  const nameFilter = c.req.query("name");
  const usernameFilter = c.req.query("username");
  const toolFilter = c.req.query("tool");
  const fromFilter = c.req.query("from");
  const toFilter = c.req.query("to");
  const db = drizzle(c.env.DB);

  const rows = await db
    .select({
      id: inductionSignoffs.id,
      toolRecordId: inductionSignoffs.toolRecordId,
      toolName: toolRecords.name,
      trainerId: inductionSignoffs.trainerId,
      trainerName: users.name,
      inducteeFullName: inductionSignoffs.inducteeFullName,
      inducteeUsername: inductionSignoffs.inducteeUsername,
      inducteeUserId: inductionSignoffs.inducteeUserId,
      trainerConfirmed: inductionSignoffs.trainerConfirmed,
      inducteeConfirmed: inductionSignoffs.inducteeConfirmed,
      signedAt: inductionSignoffs.signedAt,
      createdAt: inductionSignoffs.createdAt,
    })
    .from(inductionSignoffs)
    .innerJoin(toolRecords, eq(inductionSignoffs.toolRecordId, toolRecords.id))
    .innerJoin(users, eq(inductionSignoffs.trainerId, users.id));

  let results = rows.map((r) => ({
    ...r,
    trainerConfirmed: r.trainerConfirmed === 1,
    inducteeConfirmed: r.inducteeConfirmed === 1,
  }));

  if (nameFilter) {
    const lower = nameFilter.toLowerCase();
    results = results.filter((r) => r.inducteeFullName.toLowerCase().includes(lower));
  }

  if (usernameFilter) {
    const lower = usernameFilter.toLowerCase();
    results = results.filter((r) => r.inducteeUsername.toLowerCase().includes(lower));
  }

  if (toolFilter) {
    const lower = toolFilter.toLowerCase();
    results = results.filter((r) => r.toolName.toLowerCase().includes(lower));
  }

  if (fromFilter) {
    const fromTs = parseInt(fromFilter, 10);
    if (!isNaN(fromTs)) {
      results = results.filter((r) => r.signedAt >= fromTs);
    }
  }

  if (toFilter) {
    const toTs = parseInt(toFilter, 10);
    if (!isNaN(toTs)) {
      results = results.filter((r) => r.signedAt <= toTs);
    }
  }

  return c.json(results);
});

/**
 * GET /trainer/signoffs/:toolId — Signoffs for a specific tool.
 */
inductionsApp.get("/trainer/signoffs/:toolId", requireTrainer(), async (c) => {
  const toolId = c.req.param("toolId");
  const db = drizzle(c.env.DB);

  const [tool] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, toolId))
    .limit(1);

  if (!tool) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  const rows = await db
    .select({
      id: inductionSignoffs.id,
      trainerId: inductionSignoffs.trainerId,
      trainerName: users.name,
      inducteeFullName: inductionSignoffs.inducteeFullName,
      inducteeUsername: inductionSignoffs.inducteeUsername,
      inducteeUserId: inductionSignoffs.inducteeUserId,
      signedAt: inductionSignoffs.signedAt,
    })
    .from(inductionSignoffs)
    .innerJoin(users, eq(inductionSignoffs.trainerId, users.id))
    .where(eq(inductionSignoffs.toolRecordId, toolId));

  return c.json({
    tool: { id: tool.id, name: tool.name },
    signoffs: rows,
  });
});

// ── Tool Areas CRUD ──────────────────────────────────────────────────

/**
 * GET /areas — List all tool areas.
 */
inductionsApp.get("/areas", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(toolAreas);
  return c.json(rows);
});

/**
 * POST /areas — Create a tool area (Admin only).
 */
inductionsApp.post("/areas", requireAdminOrManager(), async (c) => {
  const body = await c.req.json<{ name?: string }>();

  if (!body.name || !body.name.trim()) {
    return c.json({ error: "Area name is required." }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  try {
    await db.insert(toolAreas).values({
      id,
      name: body.name.trim(),
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json({ error: "An area with this name already exists." }, 409);
    }
    throw err;
  }

  return c.json({ id, success: true }, 201);
});

/**
 * PUT /areas/:id — Update a tool area (Admin or area leader).
 */
inductionsApp.put("/areas/:id", requireAreaAccess("id"), async (c) => {
  const areaId = c.req.param("id");
  const body = await c.req.json<{ name?: string }>();
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(toolAreas)
    .where(eq(toolAreas.id, areaId))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Area not found." }, 404);
  }

  if (!body.name || !body.name.trim()) {
    return c.json({ error: "Area name is required." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    await db
      .update(toolAreas)
      .set({ name: body.name.trim(), updatedAt: now })
      .where(eq(toolAreas.id, areaId));
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json({ error: "An area with this name already exists." }, 409);
    }
    throw err;
  }

  return c.json({ success: true });
});

/**
 * DELETE /areas/:id — Delete a tool area (Admin only).
 */
inductionsApp.delete("/areas/:id", requireAdminOrManager(), async (c) => {
  const areaId = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(toolAreas)
    .where(eq(toolAreas.id, areaId))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Area not found." }, 404);
  }

  // Remove area leaders first
  await db.delete(areaLeaders).where(eq(areaLeaders.areaId, areaId));

  // Unset area on tools
  await db
    .update(toolRecords)
    .set({ areaId: null })
    .where(eq(toolRecords.areaId, areaId));

  await db.delete(toolAreas).where(eq(toolAreas.id, areaId));

  return c.json({ success: true });
});

// ── Area Leaders Management ──────────────────────────────────────────

/**
 * GET /areas/:id/leaders — List leaders for an area.
 */
inductionsApp.get("/areas/:id/leaders", async (c) => {
  const areaId = c.req.param("id");
  const db = drizzle(c.env.DB);

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      assignedAt: areaLeaders.assignedAt,
    })
    .from(areaLeaders)
    .innerJoin(users, eq(areaLeaders.userId, users.id))
    .where(eq(areaLeaders.areaId, areaId));

  return c.json(rows);
});

/**
 * PUT /areas/:id/leaders — Set leaders for an area (Admin only).
 * Accepts { userIds: string[] }. Replaces all current leaders.
 */
inductionsApp.put("/areas/:id/leaders", requireAdminOrManager(), async (c) => {
  const areaId = c.req.param("id");
  const body = await c.req.json<{ userIds?: string[] }>();
  const db = drizzle(c.env.DB);

  const [area] = await db
    .select()
    .from(toolAreas)
    .where(eq(toolAreas.id, areaId))
    .limit(1);

  if (!area) {
    return c.json({ error: "Area not found." }, 404);
  }

  if (!body.userIds || !Array.isArray(body.userIds)) {
    return c.json({ error: "userIds array is required." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  // Replace all leaders
  await db.delete(areaLeaders).where(eq(areaLeaders.areaId, areaId));

  for (const userId of body.userIds) {
    await db.insert(areaLeaders).values({
      userId,
      areaId,
      assignedAt: now,
    });
  }

  return c.json({ success: true });
});

// ── Tool Trainers Management ─────────────────────────────────────────

/**
 * GET /tools/:id/trainers — List trainers for a tool.
 */
inductionsApp.get("/tools/:id/trainers", async (c) => {
  const toolId = c.req.param("id");
  const db = drizzle(c.env.DB);

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      assignedAt: toolTrainers.assignedAt,
    })
    .from(toolTrainers)
    .innerJoin(users, eq(toolTrainers.userId, users.id))
    .where(eq(toolTrainers.toolRecordId, toolId));

  return c.json(rows);
});

/**
 * PUT /tools/:id/trainers — Set trainers for a tool (Admin or area leader).
 * Accepts { userIds: string[] }. Replaces all current trainers.
 */
inductionsApp.put("/tools/:id/trainers", requireToolAccess("id"), async (c) => {
  const toolId = c.req.param("id");
  const body = await c.req.json<{ userIds?: string[] }>();
  const db = drizzle(c.env.DB);

  const [tool] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, toolId))
    .limit(1);

  if (!tool) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  if (!body.userIds || !Array.isArray(body.userIds)) {
    return c.json({ error: "userIds array is required." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  // Replace all trainers
  await db.delete(toolTrainers).where(eq(toolTrainers.toolRecordId, toolId));

  for (const userId of body.userIds) {
    await db.insert(toolTrainers).values({
      userId,
      toolRecordId: toolId,
      assignedAt: now,
    });
  }

  return c.json({ success: true });
});

// ── Trainer's Tool List (scoped) ─────────────────────────────────────

/**
 * GET /trainer/my-tools — Tools the current trainer is assigned to.
 * Admins see all tools. Area leaders see tools in their areas.
 * Trainers see only their assigned tools.
 */
inductionsApp.get("/trainer/my-tools", requireTrainer(), async (c) => {
  const session = c.get("session");
  const db = drizzle(c.env.DB);

  // Admins and Managers see everything
  if (session.permissionLevel === "Admin" || session.groupLevel === "Manager") {
    const rows = await db.select().from(toolRecords);
    return c.json(rows);
  }

  // Get tools assigned directly to this trainer
  const directTools = await db
    .select({ toolRecordId: toolTrainers.toolRecordId })
    .from(toolTrainers)
    .where(eq(toolTrainers.userId, session.userId));

  // Get tools in areas this user leads
  const leaderAreas = await db
    .select({ areaId: areaLeaders.areaId })
    .from(areaLeaders)
    .where(eq(areaLeaders.userId, session.userId));

  const toolIds = new Set(directTools.map((t) => t.toolRecordId));

  if (leaderAreas.length > 0) {
    const areaIds = leaderAreas.map((a) => a.areaId);
    const allTools = await db.select().from(toolRecords);
    for (const tool of allTools) {
      if (tool.areaId && areaIds.includes(tool.areaId)) {
        toolIds.add(tool.id);
      }
    }
  }

  const allTools = await db.select().from(toolRecords);
  const filtered = allTools.filter((t) => toolIds.has(t.id));

  return c.json(filtered);
});

/**
 * GET /signoff/:toolId — Get everything needed to render the signoff form.
 * Returns tool info, checklist, and confirmation texts.
 */
inductionsApp.get("/signoff/:toolId", requireTrainer(), async (c) => {
  const toolId = c.req.param("toolId");
  const db = drizzle(c.env.DB);

  const [tool] = await db
    .select()
    .from(toolRecords)
    .where(eq(toolRecords.id, toolId))
    .limit(1);

  if (!tool) {
    return c.json({ error: "Tool record not found." }, 404);
  }

  // Get checklist
  const sections = await db
    .select()
    .from(inductionChecklists)
    .where(eq(inductionChecklists.toolRecordId, toolId));

  const allItems = sections.length > 0
    ? await db.select().from(inductionChecklistItems)
    : [];

  const itemsBySection = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const existing = itemsBySection.get(item.checklistId) ?? [];
    existing.push(item);
    itemsBySection.set(item.checklistId, existing);
  }

  const checklist = sections
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({
      id: s.id,
      sectionTitle: s.sectionTitle,
      sortOrder: s.sortOrder,
      items: (itemsBySection.get(s.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));

  return c.json({
    tool: {
      id: tool.id,
      name: tool.name,
    },
    checklist,
    trainerConfirmationText:
      "I confirm that the above named has received safety induction training on this tool, and has been provided a checklist to ensure all content has been covered.",
    inducteeConfirmationText:
      "I confirm that I have received safety induction and that I am confident in the safe use of the machine. I have been provided a checklist, and am satisfied that all points have been covered in this induction. I understand that I may be required to complete an online refresher course to remain inducted.",
  });
});

export default inductionsApp;
