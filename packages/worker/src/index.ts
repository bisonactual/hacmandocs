import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import oauth from "./auth/oauth";
import member from "./auth/member";
import usersApp from "./routes/users";
import documentsApp from "./routes/documents";
import categoriesApp from "./routes/categories";
import importApp from "./routes/import";
import exportApp from "./routes/export";
import proposalsApp from "./routes/proposals";
import searchApp from "./routes/search";
import groupsApp from "./routes/groups";
import notificationsApp from "./routes/notifications";
import inductionsApp from "./routes/inductions";
import imagesApp from "./routes/images";
import leaderboardApp from "./routes/leaderboard";
import type { SessionData } from "./auth/session";
import { authMiddleware, optionalAuthMiddleware } from "./middleware/auth";
import { requireUsernameMiddleware } from "./middleware/require-username";
import { processExpiryNotifications } from "./services/expiry-cron";

export type Env = {
  Bindings: {
    DB: D1Database;
    SESSIONS: KVNamespace;
    IMAGES: R2Bucket;
    OAUTH_CLIENT_ID: string;
    OAUTH_CLIENT_SECRET: string;
    OAUTH_REDIRECT_URI: string;
    OAUTH_PROVIDER: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REDIRECT_URI: string;
    MEMBER_API_URL: string;
    GITHUB_TOKEN?: string;
    RESEND_API_KEY?: string;
    FRONTEND_URL?: string;
  };
  Variables: {
    session: SessionData;
  };
};

const app = new Hono<Env>();

// CORS — allow the frontend origin
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://bisonactual.github.io",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.get("/", (c) => {
  return c.json({ name: "hacmandocs-worker", status: "ok" });
});

// Auth routes (no session required)
app.route("/auth/oauth", oauth);
app.route("/auth/member", member);

// Public routes — optional auth for visibility filtering
app.use("/api/documents/*", optionalAuthMiddleware);
app.use("/api/documents", optionalAuthMiddleware);
app.use("/api/categories", optionalAuthMiddleware);
app.use("/api/search", optionalAuthMiddleware);
app.use("/api/images/:key", optionalAuthMiddleware);
app.use("/api/leaderboard", optionalAuthMiddleware);

// All other /api/* routes require authentication
app.use("/api/*", createMiddleware<Env>(async (c, next) => {
  // Skip auth for public GET routes (optional auth already applied above)
  const path = c.req.path;
  const method = c.req.method;
  if (method === "GET" && (
    path.startsWith("/api/documents") ||
    path.startsWith("/api/categories") ||
    path.startsWith("/api/search") ||
    path.startsWith("/api/images/") ||
    path.startsWith("/api/leaderboard")
  )) {
    await next();
    return;
  }
  // Delegate to the real auth middleware
  return authMiddleware(c, next);
}));

// Require username to be set (exempt /api/users/me and /api/users/me/username)
app.use("/api/*", requireUsernameMiddleware);

// API routes
app.route("/api/users", usersApp);
app.route("/api/documents", documentsApp);
app.route("/api/categories", categoriesApp);
app.route("/api/import", importApp);
app.route("/api/export", exportApp);
app.route("/api/proposals", proposalsApp);
app.route("/api/search", searchApp);
app.route("/api/groups", groupsApp);
app.route("/api/notifications", notificationsApp);
app.route("/api/inductions", inductionsApp);
app.route("/api/images", imagesApp);
app.route("/api/leaderboard", leaderboardApp);

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Env["Bindings"],
    _ctx: ExecutionContext,
  ) {
    await processExpiryNotifications(env);
  },
};
