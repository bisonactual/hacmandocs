import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createSession, getSession, deleteSession, type SessionData } from './session.js';
import type { AuthMethod, PermissionLevel } from '@hacmandocs/shared';

// ── Mock KV Implementation ───────────────────────────────────────────

/**
 * Minimal mock of Cloudflare KVNamespace for testing session helpers.
 * Stores values in a Map; supports get, put, delete.
 */
function createMockKV(): KVNamespace {
  const store = new Map<string, string>();

  return {
    get(key: string) {
      return Promise.resolve(store.get(key) ?? null);
    },
    put(key: string, value: string, _options?: unknown) {
      store.set(key, value);
      return Promise.resolve();
    },
    delete(key: string) {
      store.delete(key);
      return Promise.resolve();
    },
    // Stubs for unused KVNamespace methods
    list: () => Promise.resolve({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: () => Promise.resolve({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
}

// ── Generators ───────────────────────────────────────────────────────

const permissionLevelArb: fc.Arbitrary<PermissionLevel> =
  fc.constantFrom('Viewer', 'Editor', 'Approver', 'Admin');

const authMethodArb: fc.Arbitrary<AuthMethod> =
  fc.constantFrom('oauth', 'member');

const userIdArb: fc.Arbitrary<string> =
  fc.uuid();

// ── Property 16: Session reflects assigned permission level ──────────

describe('Property 16: Session reflects assigned permission level', () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any user with an assigned permission level in the Docs_System,
   * authenticating via either OAuth or the Makerspace Member API SHALL
   * produce a session whose permission level matches the user's assigned
   * level in the Docs_System.
   */
  it('createSession stores the assigned permission level and getSession returns it', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        authMethodArb,
        permissionLevelArb,
        async (userId, authMethod, permissionLevel) => {
          const kv = createMockKV();

          // Create session with the assigned permission level
          const session = await createSession(kv, userId, authMethod, permissionLevel);

          // The returned session must have the correct userId and authMethod
          expect(session.userId).toBe(userId);
          expect(session.authMethod).toBe(authMethod);
          expect(session.token).toBeTruthy();
          expect(session.expiresAt).toBeGreaterThan(0);

          // Retrieve the session from KV and verify permission level
          const retrieved = await getSession(kv, session.token);
          expect(retrieved).not.toBeNull();
          expect(retrieved!.permissionLevel).toBe(permissionLevel);
          expect(retrieved!.userId).toBe(userId);
          expect(retrieved!.authMethod).toBe(authMethod);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 17: Member login does not derive permissions ────────────

describe('Property 17: Member login does not derive permissions', () => {
  /**
   * **Validates: Requirements 7.6**
   *
   * For any user authenticating via the Makerspace Member API, regardless
   * of the data returned by the member system API, the session permission
   * level SHALL be determined solely by the user's record in the Docs_System.
   * No field from the member API response SHALL influence the assigned
   * permission level.
   *
   * We test this by verifying that createSession only uses the explicit
   * permissionLevel parameter — no matter what extra data might exist in
   * a hypothetical member API response, the session always reflects the
   * Docs_System-assigned level.
   */
  it('session permission is determined solely by the permissionLevel parameter, not external data', async () => {
    // Arbitrary "member API response" with extra fields that should NOT influence permissions
    const memberApiResponseArb = fc.record({
      username: fc.string({ minLength: 1, maxLength: 20 }),
      role: fc.constantFrom('superadmin', 'moderator', 'owner', 'staff', 'basic'),
      admin: fc.boolean(),
      level: fc.integer({ min: 0, max: 100 }),
      permissions: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
      accessTier: fc.constantFrom('gold', 'silver', 'bronze', 'platinum'),
      isStaff: fc.boolean(),
    });

    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        permissionLevelArb,
        memberApiResponseArb,
        async (userId, docsSystemPermission, _memberApiResponse) => {
          const kv = createMockKV();

          // The Docs_System assigns the permission level from its own user record,
          // NOT from the member API response. createSession receives only the
          // Docs_System-assigned level.
          const session = await createSession(kv, userId, 'member', docsSystemPermission);

          // Retrieve and verify
          const retrieved = await getSession(kv, session.token);
          expect(retrieved).not.toBeNull();

          // Permission MUST match the Docs_System assignment, regardless of
          // whatever the member API response contained
          expect(retrieved!.permissionLevel).toBe(docsSystemPermission);
          expect(retrieved!.authMethod).toBe('member');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 18: Expired sessions are denied ─────────────────────────

describe('Property 18: Expired sessions are denied', () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * For any session token whose expiry timestamp is in the past, all API
   * access attempts using that token SHALL be denied and the system SHALL
   * require re-authentication.
   *
   * We test this by directly storing expired session data in mock KV and
   * verifying that getSession returns null (denying access).
   */
  it('getSession returns null for sessions with expiresAt in the past', async () => {
    const expiredTimestampArb = fc.integer({
      min: 0,
      // Any timestamp before "now" — use a generous range in the past
      max: Math.floor(Date.now() / 1000) - 1,
    });

    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        authMethodArb,
        permissionLevelArb,
        expiredTimestampArb,
        fc.uuid(), // token
        async (userId, authMethod, permissionLevel, expiredAt, token) => {
          const kv = createMockKV();

          // Manually store an expired session in KV (bypassing createSession
          // which always creates future-dated sessions)
          const data: SessionData = {
            userId,
            authMethod,
            permissionLevel,
            username: null,
            expiresAt: expiredAt,
          };
          await kv.put(token, JSON.stringify(data));

          // getSession must return null for expired sessions
          const result = await getSession(kv, token);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
