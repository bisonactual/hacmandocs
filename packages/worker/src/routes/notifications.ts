import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { requireRole } from "../middleware/rbac";
import { notifications } from "../db/schema";

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
