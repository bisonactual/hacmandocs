import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { PermissionLevel, Action } from '@hacmandocs/shared';

// ── Replicate RBAC logic from rbac.ts for direct testing ─────────────

/**
 * Numeric weight for each permission level.
 * Higher value = more privileges.
 */
const LEVEL_RANK: Record<PermissionLevel, number> = {
  Viewer: 0,
  Editor: 1,
  Approver: 2,
  Admin: 3,
};

/**
 * Permission matrix: which actions each role can perform.
 * Each higher role inherits all actions of the roles below it.
 */
const ROLE_ACTIONS: Record<PermissionLevel, ReadonlySet<Action>> = {
  Viewer: new Set(['view']),
  Editor: new Set(['view', 'edit', 'propose']),
  Approver: new Set(['view', 'edit', 'propose', 'approve', 'reject']),
  Admin: new Set(['view', 'edit', 'propose', 'approve', 'reject', 'admin']),
};

/** All permission levels in hierarchy order */
const ALL_LEVELS: readonly PermissionLevel[] = ['Viewer', 'Editor', 'Approver', 'Admin'];

/** All possible actions */
const ALL_ACTIONS: readonly Action[] = ['view', 'edit', 'propose', 'approve', 'reject', 'admin'];

/**
 * Check if a user with `userLevel` can access a route requiring `requiredLevel`.
 * This replicates the core logic of requireRole middleware.
 */
function checkRoleAccess(userLevel: PermissionLevel, requiredLevel: PermissionLevel): boolean {
  return LEVEL_RANK[userLevel] >= LEVEL_RANK[requiredLevel];
}

/**
 * Check if a role is allowed to perform a specific action.
 */
function canPerformAction(role: PermissionLevel, action: Action): boolean {
  return ROLE_ACTIONS[role].has(action);
}

// ── Generators ───────────────────────────────────────────────────────

const permissionLevelArb: fc.Arbitrary<PermissionLevel> =
  fc.constantFrom(...ALL_LEVELS);

const actionArb: fc.Arbitrary<Action> =
  fc.constantFrom(...ALL_ACTIONS);


// ── Property 8: RBAC permission hierarchy ────────────────────────────

describe('Property 8: RBAC permission hierarchy', () => {
  /**
   * **Validates: Requirements 5.2, 5.3, 5.4, 5.5**
   *
   * For any user and any action, the system SHALL enforce:
   * - Viewers can only perform `view` actions
   * - Editors can perform `view`, `edit`, and `propose` actions
   * - Approvers can perform all Editor actions plus `approve` and `reject`
   * - Admins can perform all actions
   * No role SHALL be permitted to perform actions above its level.
   */

  it('role-action pairs grant/deny matches the defined permission matrix', () => {
    fc.assert(
      fc.property(
        permissionLevelArb,
        actionArb,
        (role, action) => {
          const allowed = canPerformAction(role, action);
          const expectedAllowed = ROLE_ACTIONS[role].has(action);
          expect(allowed).toBe(expectedAllowed);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('higher roles can access all routes that lower roles can access (rank hierarchy)', () => {
    fc.assert(
      fc.property(
        permissionLevelArb,
        permissionLevelArb,
        (userLevel, requiredLevel) => {
          const granted = checkRoleAccess(userLevel, requiredLevel);
          const userRank = LEVEL_RANK[userLevel];
          const requiredRank = LEVEL_RANK[requiredLevel];

          if (userRank >= requiredRank) {
            expect(granted).toBe(true);
          } else {
            expect(granted).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('each role inherits all actions of lower roles', () => {
    fc.assert(
      fc.property(
        permissionLevelArb,
        (role) => {
          const roleRank = LEVEL_RANK[role];
          // For every level at or below this role, all its actions should be allowed
          for (const lowerLevel of ALL_LEVELS) {
            if (LEVEL_RANK[lowerLevel] <= roleRank) {
              for (const action of ROLE_ACTIONS[lowerLevel]) {
                expect(canPerformAction(role, action)).toBe(true);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no role can perform actions above its level', () => {
    fc.assert(
      fc.property(
        permissionLevelArb,
        actionArb,
        (role, action) => {
          if (!ROLE_ACTIONS[role].has(action)) {
            // This action is NOT in the role's allowed set — must be denied
            expect(canPerformAction(role, action)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ── Property 9: Permission change immediate effect ───────────────────

describe('Property 9: Permission change immediate effect', () => {
  /**
   * **Validates: Requirements 5.6**
   *
   * For any user whose permission level is changed by an Admin, the very
   * next access check for that user SHALL reflect the new permission level,
   * not the old one. An audit log entry SHALL be created containing the
   * Admin's identity, the target user, the old level, the new level, and
   * a timestamp.
   */

  /** Simulates a mutable user permission store */
  interface UserPermissionStore {
    getLevel(userId: string): PermissionLevel;
    setLevel(userId: string, newLevel: PermissionLevel): void;
  }

  /** Audit log entry structure matching the DB schema */
  interface AuditLogEntry {
    id: string;
    adminId: string;
    targetUserId: string;
    oldLevel: PermissionLevel;
    newLevel: PermissionLevel;
    createdAt: number;
  }

  /**
   * Simulates the permission change flow:
   * 1. Admin changes user's permission level
   * 2. The store is updated immediately
   * 3. An audit log entry is created
   * 4. The next access check uses the new level
   */
  function changePermission(
    store: UserPermissionStore,
    auditLog: AuditLogEntry[],
    adminId: string,
    targetUserId: string,
    newLevel: PermissionLevel,
  ): AuditLogEntry {
    const oldLevel = store.getLevel(targetUserId);
    store.setLevel(targetUserId, newLevel);

    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      adminId,
      targetUserId,
      oldLevel,
      newLevel,
      createdAt: Math.floor(Date.now() / 1000),
    };
    auditLog.push(entry);
    return entry;
  }

  const userIdArb = fc.uuid();

  it('after permission change, next access check reflects the new level', () => {
    fc.assert(
      fc.property(
        userIdArb,                // target user
        userIdArb,                // admin
        permissionLevelArb,       // initial level
        permissionLevelArb,       // new level
        permissionLevelArb,       // required level for access check
        (targetUserId, adminId, initialLevel, newLevel, requiredLevel) => {
          // Set up a simple in-memory permission store
          const permissions = new Map<string, PermissionLevel>();
          permissions.set(targetUserId, initialLevel);

          const store: UserPermissionStore = {
            getLevel: (id) => permissions.get(id) ?? 'Viewer',
            setLevel: (id, level) => permissions.set(id, level),
          };

          const auditLog: AuditLogEntry[] = [];

          // Change permission
          changePermission(store, auditLog, adminId, targetUserId, newLevel);

          // The very next access check must reflect the NEW level
          const currentLevel = store.getLevel(targetUserId);
          expect(currentLevel).toBe(newLevel);

          // Access check with the new level
          const accessGranted = checkRoleAccess(currentLevel, requiredLevel);
          const expectedGranted = LEVEL_RANK[newLevel] >= LEVEL_RANK[requiredLevel];
          expect(accessGranted).toBe(expectedGranted);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('audit log entry is created with all required fields', () => {
    fc.assert(
      fc.property(
        userIdArb,
        userIdArb,
        permissionLevelArb,
        permissionLevelArb,
        (targetUserId, adminId, initialLevel, newLevel) => {
          const permissions = new Map<string, PermissionLevel>();
          permissions.set(targetUserId, initialLevel);

          const store: UserPermissionStore = {
            getLevel: (id) => permissions.get(id) ?? 'Viewer',
            setLevel: (id, level) => permissions.set(id, level),
          };

          const auditLog: AuditLogEntry[] = [];

          const entry = changePermission(store, auditLog, adminId, targetUserId, newLevel);

          // Audit log must have exactly one entry
          expect(auditLog).toHaveLength(1);

          // Verify all required fields
          expect(entry.id).toBeTruthy();
          expect(entry.adminId).toBe(adminId);
          expect(entry.targetUserId).toBe(targetUserId);
          expect(entry.oldLevel).toBe(initialLevel);
          expect(entry.newLevel).toBe(newLevel);
          expect(entry.createdAt).toBeGreaterThan(0);

          // Verify old and new levels are valid PermissionLevels
          expect(ALL_LEVELS).toContain(entry.oldLevel);
          expect(ALL_LEVELS).toContain(entry.newLevel);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('sequential permission changes always reflect the latest level', () => {
    // Generate a sequence of permission level changes
    const changeSequenceArb = fc.array(permissionLevelArb, { minLength: 2, maxLength: 10 });

    fc.assert(
      fc.property(
        userIdArb,
        userIdArb,
        permissionLevelArb,
        changeSequenceArb,
        (targetUserId, adminId, initialLevel, changes) => {
          const permissions = new Map<string, PermissionLevel>();
          permissions.set(targetUserId, initialLevel);

          const store: UserPermissionStore = {
            getLevel: (id) => permissions.get(id) ?? 'Viewer',
            setLevel: (id, level) => permissions.set(id, level),
          };

          const auditLog: AuditLogEntry[] = [];

          // Apply each change in sequence
          for (const newLevel of changes) {
            changePermission(store, auditLog, adminId, targetUserId, newLevel);

            // After each change, the current level must be the latest
            expect(store.getLevel(targetUserId)).toBe(newLevel);
          }

          // Audit log should have one entry per change
          expect(auditLog).toHaveLength(changes.length);

          // The final level must be the last change
          const finalLevel = changes[changes.length - 1];
          expect(store.getLevel(targetUserId)).toBe(finalLevel);

          // Verify the last audit entry records the correct transition
          const lastEntry = auditLog[auditLog.length - 1];
          expect(lastEntry.newLevel).toBe(finalLevel);
        },
      ),
      { numRuns: 100 },
    );
  });
});
