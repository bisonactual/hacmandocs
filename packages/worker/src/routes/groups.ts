import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import {
  visibilityGroups,
  visibilityGroupMembers,
  documentVisibility,
} from "../db/schema";
import type { GroupLevel } from "@hacmandocs/shared";

const VALID_GROUP_LEVELS: GroupLevel[] = [
  "Member",
  "Non_Member",
  "Team_Leader",
  "Manager",
  "Board_Member",
];

const groupsApp = new Hono<Env>();

/**
 * GET / — List all visibility groups (Admin only).
 */
groupsApp.get("/", requireRole("Admin"), async (c) => {
  const db = drizzle(c.env.DB);

  const groups = await db.select().from(visibilityGroups);

  // For each group, fetch members and document assignments
  const result = await Promise.all(
    groups.map(async (group) => {
      const members = await db
        .select()
        .from(visibilityGroupMembers)
        .where(eq(visibilityGroupMembers.groupId, group.id));

      const docs = await db
        .select()
        .from(documentVisibility)
        .where(eq(documentVisibility.groupId, group.id));

      return {
        ...group,
        members: members.map((m) => ({ userId: m.userId, addedAt: m.addedAt })),
        documents: docs.map((d) => ({ documentId: d.documentId, assignedAt: d.assignedAt })),
      };
    }),
  );

  return c.json(result);
});

/**
 * POST / — Create a visibility group (Admin only).
 * Requires name, groupLevel, and at least one member.
 */
groupsApp.post("/", requireRole("Admin"), async (c) => {
  const body = await c.req.json<{
    name?: string;
    groupLevel?: string;
    memberIds?: string[];
  }>();

  // Validation
  if (!body.name || !body.name.trim()) {
    return c.json({ error: "Group name is required." }, 400);
  }

  if (!body.groupLevel) {
    return c.json({ error: "Group level is required." }, 400);
  }

  if (!VALID_GROUP_LEVELS.includes(body.groupLevel as GroupLevel)) {
    return c.json(
      { error: `Invalid group level. Must be one of: ${VALID_GROUP_LEVELS.join(", ")}` },
      400,
    );
  }

  if (!body.memberIds || body.memberIds.length === 0) {
    return c.json({ error: "At least one member is required." }, 400);
  }

  const db = drizzle(c.env.DB);
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(visibilityGroups).values({
    id,
    name: body.name.trim(),
    groupLevel: body.groupLevel,
    createdAt: now,
    updatedAt: now,
  });

  // Add members
  const memberValues = body.memberIds.map((userId) => ({
    groupId: id,
    userId,
    addedAt: now,
  }));

  await db.insert(visibilityGroupMembers).values(memberValues);

  const [created] = await db
    .select()
    .from(visibilityGroups)
    .where(eq(visibilityGroups.id, id))
    .limit(1);

  return c.json(created, 201);
});

/**
 * PUT /:id — Update a visibility group (Admin only).
 */
groupsApp.put("/:id", requireRole("Admin"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    groupLevel?: string;
  }>();

  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(visibilityGroups)
    .where(eq(visibilityGroups.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Group not found" }, 404);
  }

  const updates: Record<string, unknown> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return c.json({ error: "Group name is required." }, 400);
    }
    updates.name = body.name.trim();
  }

  if (body.groupLevel !== undefined) {
    if (!VALID_GROUP_LEVELS.includes(body.groupLevel as GroupLevel)) {
      return c.json(
        { error: `Invalid group level. Must be one of: ${VALID_GROUP_LEVELS.join(", ")}` },
        400,
      );
    }
    updates.groupLevel = body.groupLevel;
  }

  await db.update(visibilityGroups).set(updates).where(eq(visibilityGroups.id, id));

  const [updated] = await db
    .select()
    .from(visibilityGroups)
    .where(eq(visibilityGroups.id, id))
    .limit(1);

  return c.json(updated);
});

/**
 * DELETE /:id — Delete a visibility group (Admin only).
 * Also removes all membership and document assignment records.
 */
groupsApp.delete("/:id", requireRole("Admin"), async (c) => {
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);

  const [existing] = await db
    .select()
    .from(visibilityGroups)
    .where(eq(visibilityGroups.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Group not found" }, 404);
  }

  // Remove members and document assignments first
  await db
    .delete(visibilityGroupMembers)
    .where(eq(visibilityGroupMembers.groupId, id));

  await db
    .delete(documentVisibility)
    .where(eq(documentVisibility.groupId, id));

  await db.delete(visibilityGroups).where(eq(visibilityGroups.id, id));

  return c.json({ success: true });
});

/**
 * POST /:id/members — Add a member to a group (Admin only).
 */
groupsApp.post("/:id/members", requireRole("Admin"), async (c) => {
  const groupId = c.req.param("id");
  const body = await c.req.json<{ userId?: string }>();

  if (!body.userId) {
    return c.json({ error: "userId is required" }, 400);
  }

  const db = drizzle(c.env.DB);

  const [group] = await db
    .select()
    .from(visibilityGroups)
    .where(eq(visibilityGroups.id, groupId))
    .limit(1);

  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);

  await db.insert(visibilityGroupMembers).values({
    groupId,
    userId: body.userId,
    addedAt: now,
  });

  return c.json({ success: true }, 201);
});

/**
 * DELETE /:id/members/:userId — Remove a member from a group (Admin only).
 */
groupsApp.delete("/:id/members/:userId", requireRole("Admin"), async (c) => {
  const groupId = c.req.param("id");
  const userId = c.req.param("userId");
  const db = drizzle(c.env.DB);

  await db
    .delete(visibilityGroupMembers)
    .where(
      and(
        eq(visibilityGroupMembers.groupId, groupId),
        eq(visibilityGroupMembers.userId, userId),
      ),
    );

  return c.json({ success: true });
});

/**
 * POST /:id/documents — Assign a group to a document (Admin only).
 */
groupsApp.post("/:id/documents", requireRole("Admin"), async (c) => {
  const groupId = c.req.param("id");
  const body = await c.req.json<{ documentId?: string }>();

  if (!body.documentId) {
    return c.json({ error: "documentId is required" }, 400);
  }

  const db = drizzle(c.env.DB);

  const [group] = await db
    .select()
    .from(visibilityGroups)
    .where(eq(visibilityGroups.id, groupId))
    .limit(1);

  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);

  await db.insert(documentVisibility).values({
    documentId: body.documentId,
    groupId,
    assignedAt: now,
  });

  return c.json({ success: true }, 201);
});

/**
 * DELETE /:id/documents/:documentId — Remove group from document (Admin only).
 */
groupsApp.delete(
  "/:id/documents/:documentId",
  requireRole("Admin"),
  async (c) => {
    const groupId = c.req.param("id");
    const documentId = c.req.param("documentId");
    const db = drizzle(c.env.DB);

    await db
      .delete(documentVisibility)
      .where(
        and(
          eq(documentVisibility.groupId, groupId),
          eq(documentVisibility.documentId, documentId),
        ),
      );

    return c.json({ success: true });
  },
);

export default groupsApp;
