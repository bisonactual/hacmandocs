import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { editProposals, inductionSignoffs, users } from "../db/schema";

const leaderboardApp = new Hono<Env>();

/**
 * GET / — Top 5 editors (most approved proposals) and top 5 trainers (most sign-offs).
 * Public endpoint — no auth required.
 */
leaderboardApp.get("/", async (c) => {
  const db = drizzle(c.env.DB);

  // Top editors: users with most approved proposals
  const editorRows = await db
    .select({
      userId: editProposals.authorId,
      name: users.name,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(editProposals)
    .innerJoin(users, sql`${editProposals.authorId} = ${users.id}`)
    .where(sql`${editProposals.status} = 'approved'`)
    .groupBy(editProposals.authorId)
    .orderBy(sql`count(*) DESC`)
    .limit(5);

  // Top trainers: users with most completed sign-offs (both parties confirmed)
  const trainerRows = await db
    .select({
      userId: inductionSignoffs.trainerId,
      name: users.name,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(inductionSignoffs)
    .innerJoin(users, sql`${inductionSignoffs.trainerId} = ${users.id}`)
    .where(
      sql`${inductionSignoffs.trainerConfirmed} = 1 AND ${inductionSignoffs.inducteeConfirmed} = 1`,
    )
    .groupBy(inductionSignoffs.trainerId)
    .orderBy(sql`count(*) DESC`)
    .limit(5);

  return c.json({
    topEditors: editorRows.map((r) => ({
      userId: r.userId,
      name: r.name,
      count: r.count,
    })),
    topTrainers: trainerRows.map((r) => ({
      userId: r.userId,
      name: r.name,
      count: r.count,
    })),
  });
});

export default leaderboardApp;
