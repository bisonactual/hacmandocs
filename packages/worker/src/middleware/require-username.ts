import { createMiddleware } from "hono/factory";
import type { Env } from "../index";

/**
 * Middleware that requires authenticated users to have set their hackspace username.
 * Returns 403 with { error: "username_required" } if username is null.
 *
 * Exempt paths (users need these to set their username):
 * - GET /api/users/me
 * - PUT /api/users/me/username
 */
export const requireUsernameMiddleware = createMiddleware<Env>(async (c, next) => {
  const session = c.get("session");

  // If no session (optional auth routes), skip
  if (!session) {
    await next();
    return;
  }

  // Exempt paths that are needed to set the username
  const path = c.req.path;
  const method = c.req.method;

  if (path === "/api/users/me" && method === "GET") {
    await next();
    return;
  }

  if (path === "/api/users/me/username" && method === "PUT") {
    await next();
    return;
  }

  if (session.username === null || session.username === undefined) {
    return c.json({ error: "username_required", message: "Please set your hackspace username before continuing." }, 403);
  }

  await next();
});
