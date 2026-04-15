import type { AuthMethod, GroupLevel, PermissionLevel, Session } from '@hacmandocs/shared';

/** Data stored in KV for each session. */
export interface SessionData {
  userId: string;
  authMethod: AuthMethod;
  permissionLevel: PermissionLevel;
  groupLevel: GroupLevel;
  username: string | null;
  expiresAt: number;
}

/** Default session duration: 24 hours in seconds. */
const SESSION_TTL_SECONDS = 86_400;

/**
 * Create a new session in KV and return the Session object.
 * The KV entry uses a TTL so Cloudflare automatically evicts expired sessions.
 * Also stores a reverse-lookup entry (`user-sessions:{userId}`) for session invalidation.
 */
export async function createSession(
  kv: KVNamespace,
  userId: string,
  authMethod: AuthMethod,
  permissionLevel: PermissionLevel,
  username: string | null = null,
  groupLevel: GroupLevel = "Member",
): Promise<Session> {
  const token = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  const data: SessionData = { userId, authMethod, permissionLevel, groupLevel, username, expiresAt };

  await kv.put(token, JSON.stringify(data), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  // Append token to reverse-lookup list for session invalidation
  const reverseKey = `user-sessions:${userId}`;
  const raw = await kv.get(reverseKey);
  const tokens: string[] = raw ? JSON.parse(raw) : [];
  tokens.push(token);
  await kv.put(reverseKey, JSON.stringify(tokens), {
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

  const parsed = JSON.parse(raw);

  // Fallback for pre-migration sessions that lack groupLevel
  const data: SessionData = {
    ...parsed,
    groupLevel: parsed.groupLevel ?? "Member",
  };

  // Double-check expiry in case KV TTL hasn't evicted yet
  if (data.expiresAt <= Math.floor(Date.now() / 1000)) {
    await kv.delete(token);
    return null;
  }

  return data;
}

/**
 * Delete a session from KV (logout).
 * Also removes the token from the reverse-lookup list.
 */
export async function deleteSession(
  kv: KVNamespace,
  token: string,
): Promise<void> {
  // Read the session to get the userId for reverse-lookup cleanup
  const raw = await kv.get(token);
  if (raw) {
    const data = JSON.parse(raw);
    const userId = data.userId as string;
    if (userId) {
      const reverseKey = `user-sessions:${userId}`;
      const listRaw = await kv.get(reverseKey);
      if (listRaw) {
        const tokens: string[] = JSON.parse(listRaw);
        const filtered = tokens.filter((t) => t !== token);
        if (filtered.length > 0) {
          await kv.put(reverseKey, JSON.stringify(filtered), {
            expirationTtl: SESSION_TTL_SECONDS,
          });
        } else {
          await kv.delete(reverseKey);
        }
      }
    }
  }
  await kv.delete(token);
}

/**
 * Invalidate all active sessions for a user.
 * Reads the reverse-lookup key, deletes each session token, then clears the list.
 */
export async function invalidateUserSessions(
  kv: KVNamespace,
  userId: string,
): Promise<void> {
  const key = `user-sessions:${userId}`;
  const raw = await kv.get(key);
  if (raw) {
    const tokens: string[] = JSON.parse(raw);
    await Promise.all(tokens.map((t) => kv.delete(t)));
    await kv.delete(key);
  }
}
