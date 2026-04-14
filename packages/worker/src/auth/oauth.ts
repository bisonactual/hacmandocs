import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { createSession } from "./session";
import type { Env } from "../index";

const oauth = new Hono<Env>();

// ── Provider helpers ─────────────────────────────────────────────────

interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  /** Extract a stable external id from the provider's user-info payload. */
  extractProfile: (data: Record<string, unknown>) => {
    externalId: string;
    email: string;
    name: string;
  };
}

function getProviderConfig(provider: string): OAuthProviderConfig {
  switch (provider) {
    case "github":
      return {
        authorizeUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        userInfoUrl: "https://api.github.com/user",
        scopes: ["read:user", "user:email"],
        extractProfile: (data) => ({
          externalId: String(data.id),
          email: (data.email as string) ?? "",
          name: (data.name as string) ?? (data.login as string) ?? "",
        }),
      };
    case "google":
      return {
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
        scopes: ["openid", "email", "profile"],
        extractProfile: (data) => ({
          externalId: String(data.sub),
          email: (data.email as string) ?? "",
          name: (data.name as string) ?? "",
        }),
      };
    default:
      throw new Error(`Unsupported OAuth provider: ${provider}`);
  }
}

/** Return the client ID and secret for the given provider. */
function getProviderCredentials(env: Env["Bindings"], provider: string) {
  switch (provider) {
    case "google":
      return {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.GOOGLE_REDIRECT_URI,
      };
    case "github":
    default:
      return {
        clientId: env.OAUTH_CLIENT_ID,
        clientSecret: env.OAUTH_CLIENT_SECRET,
        redirectUri: env.OAUTH_REDIRECT_URI,
      };
  }
}

// ── Routes ───────────────────────────────────────────────────────────

/**
 * GET /login — redirect the user to the OAuth provider's authorization page.
 */
oauth.get("/login", (c) => {
  const provider = c.req.query("provider") ?? c.env.OAUTH_PROVIDER ?? "github";
  const config = getProviderConfig(provider);
  const creds = getProviderCredentials(c.env, provider);

  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    scope: config.scopes.join(" "),
    response_type: "code",
    state: provider,
  });

  // Google requires access_type for refresh tokens (optional) and needs prompt param
  if (provider === "google") {
    params.set("access_type", "online");
  }

  return c.redirect(`${config.authorizeUrl}?${params.toString()}`);
});

/**
 * GET /callback — exchange the authorization code for a token,
 * fetch the user profile, upsert in D1, and create a KV session.
 */
oauth.get("/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  // Recover provider from the state param we set during /login
  const provider = c.req.query("state") ?? c.env.OAUTH_PROVIDER ?? "github";
  const config = getProviderConfig(provider);
  const creds = getProviderCredentials(c.env, provider);

  // 1. Exchange code for access token
  const tokenBody: Record<string, string> = {
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    redirect_uri: creds.redirectUri,
  };
  // Google requires grant_type
  if (provider === "google") {
    tokenBody.grant_type = "authorization_code";
  }

  const tokenRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(tokenBody),
  });

  if (!tokenRes.ok) {
    return c.json({ error: "Failed to exchange authorization code" }, 502);
  }

  const tokenData = (await tokenRes.json()) as Record<string, unknown>;
  const accessToken = tokenData.access_token as string | undefined;
  if (!accessToken) {
    return c.json({ error: "No access token returned by provider" }, 502);
  }

  // 2. Fetch user profile from provider
  const profileRes = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "hacmandocs-worker",
    },
  });

  if (!profileRes.ok) {
    return c.json({ error: "Failed to fetch user profile" }, 502);
  }

  const profileData = (await profileRes.json()) as Record<string, unknown>;
  const profile = config.extractProfile(profileData);

  // 3. Upsert user in D1 via Drizzle
  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.externalId, profile.externalId))
    .get();

  let userId: string;
  let permissionLevel: string;
  let username: string | null;

  if (existing) {
    userId = existing.id;
    permissionLevel = existing.permissionLevel;
    username = existing.username;
    // Update profile fields that may have changed at the provider
    await db
      .update(users)
      .set({ email: profile.email, name: profile.name, updatedAt: now })
      .where(eq(users.id, userId))
      .run();
  } else {
    userId = crypto.randomUUID();
    permissionLevel = "Viewer"; // new OAuth users default to Viewer
    username = null;
    await db
      .insert(users)
      .values({
        id: userId,
        email: profile.email,
        name: profile.name,
        authMethod: "oauth",
        externalId: profile.externalId,
        permissionLevel,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  // 4. Create KV session
  const session = await createSession(
    c.env.SESSIONS,
    userId,
    "oauth",
    permissionLevel as import("@hacmandocs/shared").PermissionLevel,
    username,
  );

  // Redirect back to the frontend with the token
  const frontendUrl = (c.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const redirectUrl = `${frontendUrl}/auth/callback?token=${encodeURIComponent(session.token)}&expiresAt=${session.expiresAt}`;
  return c.redirect(redirectUrl);
});

export default oauth;
