import type { AuthMethod, PermissionLevel, Session } from '@hacmandocs/shared';

/** Data stored in KV for each session. */
export interface SessionData {
  userId: string;
  authMethod: AuthMethod;
  permissionLevel: PermissionLevel;
  username: string | null;
  expiresAt: number;
}

/** Default session duration: 24 hours in seconds. */
const SESSION_TTL_SECONDS = 86_400;

/**
 * Create a new session in KV and return the Session object.
 * The KV entry uses a TTL so Cloudflare automatically evicts expired sessions.
 */
export async function createSession(
  kv: KVNamespace,
  userId: string,
  authMethod: AuthMethod,
  permissionLevel: PermissionLevel,
  username: string | null = null,
): Promise<Session> {
  const token = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  const data: SessionData = { userId, authMethod, permissionLevel, username, expiresAt };

  await kv.put(token, JSON.stringify(data), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return { token, userId, authMethod, expiresAt };
}

/**
 * Retrieve session data from KV by token.
 * Returns null if the token doesn't exist (or was evicted by TTL).
 */
export async function getSession(
  kv: KVNamespace,
  token: string,
): Promise<SessionData | null> {
  const raw = await kv.get(token);
  if (raw === null) return null;

  const data: SessionData = JSON.parse(raw);

  // Double-check expiry in case KV TTL hasn't evicted yet
  if (data.expiresAt <= Math.floor(Date.now() / 1000)) {
    await kv.delete(token);
    return null;
  }

  return data;
}

/**
 * Delete a session from KV (logout).
 */
export async function deleteSession(
  kv: KVNamespace,
  token: string,
): Promise<void> {
  await kv.delete(token);
}
