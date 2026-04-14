import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { createSession } from "./session";
import type { Env } from "../index";

const member = new Hono<Env>();

/**
 * POST /login — authenticate via the Makerspace Member API.
 *
 * Accepts { username, password }, forwards them to the external member system,
 * upserts the user in D1, and returns a KV-backed session token.
 *
 * Permission level is NEVER derived from the member API response;
 * it comes solely from the user's existing D1 record (Req 7.6).
 */
member.post("/login", async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();

  if (!body.username || !body.password) {
    return c.json({ error: "Username and password are required" }, 400);
  }

  // Dev bypass: accept admin/admin without calling external API
  const isDev = !c.env.MEMBER_API_URL || c.env.MEMBER_API_URL === "DEV_BYPASS";
  
  if (!isDev) {
    // Production: forward credentials to the Makerspace Member API
    const memberRes = await fetch(c.env.MEMBER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: body.username,
        password: body.password,
      }),
    });

    if (!memberRes.ok) {
      return c.json({ error: "Invalid member credentials" }, 401);
    }
  } else {
    // Dev mode: accept any username with password "admin"
    if (body.password !== "admin") {
      return c.json({ error: "Invalid member credentials" }, 401);
    }
  }

  const username = body.username;

  // 2. Upsert user in D1 via Drizzle
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.externalId, username))
    .get();

  let userId: string;
  let permissionLevel: string;

  if (existing) {
    userId = existing.id;
    permissionLevel = existing.permissionLevel;
    await db
      .update(users)
      .set({ username, updatedAt: now })
      .where(eq(users.id, userId))
      .run();
  } else {
    userId = crypto.randomUUID();
    permissionLevel = "Viewer"; // new member users default to Viewer
    await db
      .insert(users)
      .values({
        id: userId,
        email: "",
        name: username,
        username,
        authMethod: "member",
        externalId: username,
        permissionLevel,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  // 3. Create KV session
  const session = await createSession(
    c.env.SESSIONS,
    userId,
    "member",
    permissionLevel as import("@hacmandocs/shared").PermissionLevel,
    username,
  );

  return c.json({ token: session.token, expiresAt: session.expiresAt });
});

export default member;
