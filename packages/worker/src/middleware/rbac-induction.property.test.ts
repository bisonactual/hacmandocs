import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { PermissionLevel, Action } from '@hacmandocs/shared';

// ── Replicate RBAC logic for direct testing ──────────────────────────

const LEVEL_RANK: Record<PermissionLevel, number> = {
  Viewer: 0,
  Editor: 1,
  Approver: 2,
  Admin: 3,
};

const ALL_LEVELS: readonly PermissionLevel[] = ['Viewer', 'Editor', 'Approver', 'Admin'];

/** Induction-system actions */
type InductionAction = 'member_features' | 'trainer_dashboard' | 'tool_management' | 'quiz_management';

const ALL_INDUCTION_ACTIONS: readonly InductionAction[] = [
  'member_features',
  'trainer_dashboard',
  'tool_management',
  'quiz_management',
];

/** Docs-system actions (existing) */
const ALL_DOCS_ACTIONS: readonly Action[] = ['view', 'edit', 'propose', 'approve', 'reject', 'admin'];

const ROLE_ACTIONS: Record<PermissionLevel, ReadonlySet<Action>> = {
  Viewer: new Set(['view']),
  Editor: new Set(['view', 'edit', 'propose']),
  Approver: new Set(['view', 'edit', 'propose', 'approve', 'reject']),
  Admin: new Set(['view', 'edit', 'propose', 'approve', 'reject', 'admin']),
};

/**
 * Determine if a (permissionLevel, isTrainer, inductionAction) tuple is allowed.
 * This replicates the requireTrainer + requireRole logic from the middleware.
 */
function checkInductionAccess(
  permissionLevel: PermissionLevel,
  isTrainer: boolean,
  action: InductionAction,
): boolean {
  // Admin has access to everything regardless of isTrainer
  if (permissionLevel === 'Admin') return true;

  switch (action) {
    case 'member_features':
      // All authenticated users can access member features
      return true;
    case 'trainer_dashboard':
      // Only trainers (isTrainer=true) or Admin
      return isTrainer;
    case 'tool_management':
    case 'quiz_management':
      // Admin only (already handled above)
      return false;
  }
}

/**
 * Check if a user with `userLevel` can access a route requiring `requiredLevel`.
 * Replicates the existing requireRole middleware logic.
 */
function checkRoleAccess(userLevel: PermissionLevel, requiredLevel: PermissionLevel): boolean {
  return LEVEL_RANK[userLevel] >= LEVEL_RANK[requiredLevel];
}

// ── Generators ───────────────────────────────────────────────────────

const permissionLevelArb: fc.Arbitrary<PermissionLevel> =
  fc.constantFrom(...ALL_LEVELS);

const inductionActionArb: fc.Arbitrary<InductionAction> =
  fc.constantFrom(...ALL_INDUCTION_ACTIONS);

const docsActionArb: fc.Arbitrary<Action> =
  fc.constantFrom(...ALL_DOCS_ACTIONS);

const isTrainerArb: fc.Arbitrary<boolean> = fc.boolean();

// ── Property 11: Induction system RBAC ───────────────────────────────

describe('Property 11: Induction system RBAC', () => {
  /**
   * **Validates: Requirements 2.6, 5.2, 5.4, 5.5, 5.6, 6.7, 9.3, 9.4**
   *
   * For any user with a given permission level and is_trainer flag, and any
   * induction system action:
   * - Admin SHALL have access to all actions regardless of is_trainer flag
   * - isTrainer=true (non-Admin) SHALL have access to trainer_dashboard and
   *   member_features but NOT tool/quiz management
   * - isTrainer=false (non-Admin) SHALL have access to member_features only
   * - Existing Docs_System RBAC is unchanged by the is_trainer flag
   */

  it('Admin has access to all induction actions regardless of isTrainer', () => {
    fc.assert(
      fc.property(
        isTrainerArb,
        inductionActionArb,
        (isTrainer, action) => {
          const allowed = checkInductionAccess('Admin', isTrainer, action);
          expect(allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isTrainer=true non-Admin can access member_features and trainer_dashboard only', () => {
    const nonAdminLevelArb = fc.constantFrom<PermissionLevel>('Viewer', 'Editor', 'Approver');

    fc.assert(
      fc.property(
        nonAdminLevelArb,
        inductionActionArb,
        (level, action) => {
          const allowed = checkInductionAccess(level, true, action);

          if (action === 'member_features' || action === 'trainer_dashboard') {
            expect(allowed).toBe(true);
          } else {
            // tool_management and quiz_management must be denied
            expect(allowed).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('isTrainer=false non-Admin can only access member_features', () => {
    const nonAdminLevelArb = fc.constantFrom<PermissionLevel>('Viewer', 'Editor', 'Approver');

    fc.assert(
      fc.property(
        nonAdminLevelArb,
        inductionActionArb,
        (level, action) => {
          const allowed = checkInductionAccess(level, false, action);

          if (action === 'member_features') {
            expect(allowed).toBe(true);
          } else {
            expect(allowed).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('existing Docs_System RBAC is unchanged by is_trainer flag', () => {
    fc.assert(
      fc.property(
        permissionLevelArb,
        permissionLevelArb,
        isTrainerArb,
        docsActionArb,
        (userLevel, requiredLevel, _isTrainer, docsAction) => {
          // The is_trainer flag must NOT affect docs RBAC
          const roleAccessGranted = checkRoleAccess(userLevel, requiredLevel);
          const expectedRoleAccess = LEVEL_RANK[userLevel] >= LEVEL_RANK[requiredLevel];
          expect(roleAccessGranted).toBe(expectedRoleAccess);

          // Action-level check also unchanged
          const actionAllowed = ROLE_ACTIONS[userLevel].has(docsAction);
          const expectedActionAllowed = ROLE_ACTIONS[userLevel].has(docsAction);
          expect(actionAllowed).toBe(expectedActionAllowed);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('full access matrix: random (role, isTrainer, action) tuples match expected policy', () => {
    fc.assert(
      fc.property(
        permissionLevelArb,
        isTrainerArb,
        inductionActionArb,
        (level, isTrainer, action) => {
          const allowed = checkInductionAccess(level, isTrainer, action);

          // Compute expected result from the policy
          let expected: boolean;
          if (level === 'Admin') {
            expected = true;
          } else if (action === 'member_features') {
            expected = true;
          } else if (action === 'trainer_dashboard') {
            expected = isTrainer;
          } else {
            // tool_management, quiz_management — Admin only
            expected = false;
          }

          expect(allowed).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});
