import { createMiddleware } from "hono/factory";
import type { Env } from "../index";
import { getSession } from "../auth/session";

/**
 * Auth middleware — reads session token from Authorization header or
 * `session` cookie, validates it against KV, and attaches the session
 * data to the Hono context for downstream handlers.
 *
 * Returns 401 JSON if no valid session is found.
 */
export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  // 1. Extract token from Authorization header or cookie
  let token: string | undefined;

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  if (!token) {
    const cookie = c.req.header("Cookie");
    if (cookie) {
      const match = cookie
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("session="));
      if (match) {
        token = match.slice("session=".length);
      }
    }
  }

  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // 2. Look up session in KV (getSession already handles expiry checks)
  const session = await getSession(c.env.SESSIONS, token);

  if (!session) {
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  // 3. Attach session to context for downstream handlers
  c.set("session", session);

  await next();
});

/**
 * Optional auth middleware — attaches session if present but does NOT
 * reject unauthenticated requests. Use for public routes that behave
 * differently for logged-in users (e.g., visibility filtering).
 */
export const optionalAuthMiddleware = createMiddleware<Env>(async (c, next) => {
  let token: string | undefined;

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  if (!token) {
    const cookie = c.req.header("Cookie");
    if (cookie) {
      const match = cookie
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("session="));
      if (match) {
        token = match.slice("session=".length);
      }
    }
  }

  if (token) {
    const session = await getSession(c.env.SESSIONS, token);
    if (session) {
      c.set("session", session);
    }
  }

  await next();
});
