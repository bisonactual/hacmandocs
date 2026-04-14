import { Hono } from "hono";
import { cors } from "hono/cors";
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
import type { SessionData } from "./auth/session";
import { authMiddleware, optionalAuthMiddleware } from "./middleware/auth";
import { requireUsernameMiddleware } from "./middleware/require-username";
import { processExpiryNotifications } from "./services/expiry-cron";

export type Env = {
  Bindings: {
    DB: D1Database;
    SESSIONS: KVNamespace;
    OAUTH_CLIENT_ID: string;
    OAUTH_CLIENT_SECRET: string;
    OAUTH_REDIRECT_URI: string;
    OAUTH_PROVIDER: string;
    MEMBER_API_URL: string;
    GITHUB_TOKEN?: string;
    RESEND_API_KEY?: string;
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
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
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

// All other /api/* routes require authentication
app.use("/api/*", authMiddleware);

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
