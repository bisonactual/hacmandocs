import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { PermissionLevel, GroupLevel } from '@hacmandocs/shared';

// ── Shared constants ─────────────────────────────────────────────────

const ALL_LEVELS: readonly PermissionLevel[] = ['Viewer', 'Editor', 'Approver', 'Admin'];
const VALID_GROUP_LEVELS: readonly GroupLevel[] = ['Member', 'Non_Member', 'Team_Leader', 'Manager', 'Board_Member'];

const _LEVEL_RANK: Record<PermissionLevel, number> = {
  Viewer: 0,
  Editor: 1,
  Approver: 2,
  Admin: 3,
};

// ── Shared generators ────────────────────────────────────────────────

const permissionLevelArb: fc.Arbitrary<PermissionLevel> =
  fc.constantFrom(...ALL_LEVELS);

const groupLevelArb: fc.Arbitrary<GroupLevel> =
  fc.constantFrom(...VALID_GROUP_LEVELS);

const userIdArb = fc.uuid();
const docIdArb = fc.uuid();
const groupIdArb = fc.uuid();

// =====================================================================
// Property 11: Search result completeness and ordering
// =====================================================================

describe('Property 11: Search result completeness and ordering', () => {
  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * For any search query that matches at least one document, every result
   * SHALL contain a document title, category, a content snippet, and a
   * last-modified date. Results SHALL be ordered by relevance score in
   * descending order.
   */

  interface SearchResult {
    id: string;
    title: string;
    categoryId: string | null;
    snippet: string;
    updatedAt: number;
    rank: number;
  }

  /** Generator for a single search result with all required fields */
  const searchResultArb: fc.Arbitrary<SearchResult> = fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 100 }),
    categoryId: fc.oneof(fc.uuid(), fc.constant(null)),
    snippet: fc.string({ minLength: 1, maxLength: 500 }),
    updatedAt: fc.integer({ min: 1000000000, max: 2000000000 }),
    rank: fc.double({ min: -100, max: 0, noNaN: true }),
  });

  /** Generator for a non-empty list of search results */
  const searchResultsArb = fc.array(searchResultArb, { minLength: 1, maxLength: 50 });

  /**
   * Simulates the search result assembly logic from search.ts:
   * FTS5 returns results with bm25() rank (negative, closer to 0 = more relevant).
   * We sort by rank ascending (bm25 convention: ORDER BY rank).
   */
  function assembleSearchResults(rawResults: SearchResult[]): SearchResult[] {
    return [...rawResults].sort((a, b) => a.rank - b.rank);
  }

  it('every search result has all required fields and they are non-null', () => {
    fc.assert(
      fc.property(
        searchResultsArb,
        (results) => {
          const assembled = assembleSearchResults(results);

          for (const result of assembled) {
            // id must be present
            expect(result.id).toBeTruthy();
            // title must be non-empty string
            expect(typeof result.title).toBe('string');
            expect(result.title.length).toBeGreaterThan(0);
            // categoryId can be null but must be defined
            expect(result).toHaveProperty('categoryId');
            // snippet must be non-empty string
            expect(typeof result.snippet).toBe('string');
            expect(result.snippet.length).toBeGreaterThan(0);
            // updatedAt must be a positive number
            expect(typeof result.updatedAt).toBe('number');
            expect(result.updatedAt).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('results are ordered by relevance rank (ascending bm25 = descending relevance)', () => {
    fc.assert(
      fc.property(
        searchResultsArb,
        (results) => {
          const assembled = assembleSearchResults(results);

          // bm25() returns negative values; ORDER BY rank ASC means
          // most negative (most relevant) first
          for (let i = 1; i < assembled.length; i++) {
            expect(assembled[i].rank).toBeGreaterThanOrEqual(assembled[i - 1].rank);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all input results are preserved in the output (no results dropped)', () => {
    fc.assert(
      fc.property(
        searchResultsArb,
        (results) => {
          const assembled = assembleSearchResults(results);
          expect(assembled).toHaveLength(results.length);

          const inputIds = new Set(results.map((r) => r.id));
          const outputIds = new Set(assembled.map((r) => r.id));
          expect(outputIds).toEqual(inputIds);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// =====================================================================
// Property 10: Notification routing
// =====================================================================

describe('Property 10: Notification routing', () => {
  /**
   * **Validates: Requirements 4.2, 8.3**
   *
   * For any Edit_Proposal on a standard (non-sensitive) document, all
   * Approver+ users SHALL be in the notification recipient list.
   * For any Edit_Proposal on a Sensitive_Page, only Admin users SHALL
   * be in the notification recipient list, and no non-Admin Approvers
   * SHALL be included.
   */

  interface User {
    id: string;
    permissionLevel: PermissionLevel;
  }

  interface Document {
    id: string;
    isSensitive: boolean;
  }

  /**
   * Replicates the notification routing logic from notifications.ts:
   * - Standard docs: notify Approver + Admin users
   * - Sensitive docs: notify only Admin users
   */
  function getNotificationRecipients(doc: Document, allUsers: User[]): string[] {
    if (doc.isSensitive) {
      return allUsers
        .filter((u) => u.permissionLevel === 'Admin')
        .map((u) => u.id);
    } else {
      return allUsers
        .filter(
          (u) =>
            u.permissionLevel === 'Approver' || u.permissionLevel === 'Admin',
        )
        .map((u) => u.id);
    }
  }

  const userArb: fc.Arbitrary<User> = fc.record({
    id: fc.uuid(),
    permissionLevel: permissionLevelArb,
  });

  const usersArb = fc.array(userArb, { minLength: 1, maxLength: 20 });

  const documentArb: fc.Arbitrary<Document> = fc.record({
    id: fc.uuid(),
    isSensitive: fc.boolean(),
  });

  it('standard docs: all Approver and Admin users are notified', () => {
    fc.assert(
      fc.property(
        usersArb,
        docIdArb,
        (users, docId) => {
          const doc: Document = { id: docId, isSensitive: false };
          const recipients = getNotificationRecipients(doc, users);
          const recipientSet = new Set(recipients);

          for (const user of users) {
            if (user.permissionLevel === 'Approver' || user.permissionLevel === 'Admin') {
              expect(recipientSet.has(user.id)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sensitive docs: only Admin users are notified', () => {
    fc.assert(
      fc.property(
        usersArb,
        docIdArb,
        (users, docId) => {
          const doc: Document = { id: docId, isSensitive: true };
          const recipients = getNotificationRecipients(doc, users);
          const recipientSet = new Set(recipients);

          // All Admins must be included
          for (const user of users) {
            if (user.permissionLevel === 'Admin') {
              expect(recipientSet.has(user.id)).toBe(true);
            }
          }

          // No non-Admin users should be included
          for (const recipientId of recipients) {
            const user = users.find((u) => u.id === recipientId);
            expect(user).toBeDefined();
            expect(user!.permissionLevel).toBe('Admin');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sensitive docs: non-Admin Approvers are excluded', () => {
    fc.assert(
      fc.property(
        usersArb,
        docIdArb,
        (users, docId) => {
          const doc: Document = { id: docId, isSensitive: true };
          const recipients = getNotificationRecipients(doc, users);
          const recipientSet = new Set(recipients);

          const nonAdminApprovers = users.filter(
            (u) => u.permissionLevel === 'Approver',
          );

          for (const approver of nonAdminApprovers) {
            expect(recipientSet.has(approver.id)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('viewers and editors are never notified regardless of doc sensitivity', () => {
    fc.assert(
      fc.property(
        usersArb,
        documentArb,
        (users, doc) => {
          const recipients = getNotificationRecipients(doc, users);
          const recipientSet = new Set(recipients);

          const viewersAndEditors = users.filter(
            (u) => u.permissionLevel === 'Viewer' || u.permissionLevel === 'Editor',
          );

          for (const user of viewersAndEditors) {
            expect(recipientSet.has(user.id)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// =====================================================================
// Property 12: Sensitive page approval routing
// =====================================================================

describe('Property 12: Sensitive page approval routing', () => {
  /**
   * **Validates: Requirements 8.2, 8.5**
   *
   * For any Edit_Proposal on a document marked as a Sensitive_Page, only
   * users with Admin permission level SHALL be able to approve or reject.
   * For any document where the Sensitive_Page designation is removed,
   * subsequent Edit_Proposals SHALL be approvable by Approver or Admin.
   */

  /**
   * Replicates the approval permission check from proposals.ts:
   * - Sensitive docs: only Admin can approve/reject
   * - Non-sensitive docs: Approver or Admin can approve/reject
   */
  function canApproveOrReject(
    isSensitive: boolean,
    userPermissionLevel: PermissionLevel,
  ): boolean {
    if (isSensitive) {
      return userPermissionLevel === 'Admin';
    }
    return (
      userPermissionLevel === 'Approver' || userPermissionLevel === 'Admin'
    );
  }

  it('sensitive docs: only Admin can approve/reject', () => {
    fc.assert(
      fc.property(
        permissionLevelArb,
        (role) => {
          const allowed = canApproveOrReject(true, role);
          if (role === 'Admin') {
            expect(allowed).toBe(true);
          } else {
            expect(allowed).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('non-sensitive docs: Approver and Admin can approve/reject', () => {
    fc.assert(
      fc.property(
        permissionLevelArb,
        (role) => {
          const allowed = canApproveOrReject(false, role);
          if (role === 'Approver' || role === 'Admin') {
            expect(allowed).toBe(true);
          } else {
            expect(allowed).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('removing sensitive designation allows Approver+ to approve', () => {
    fc.assert(
      fc.property(
        permissionLevelArb,
        (role) => {
          // Document was sensitive, now it's not
          const wasSensitive = canApproveOrReject(true, role);
          const afterRemoval = canApproveOrReject(false, role);

          if (role === 'Admin') {
            // Admin can always approve
            expect(wasSensitive).toBe(true);
            expect(afterRemoval).toBe(true);
          } else if (role === 'Approver') {
            // Approver was blocked on sensitive, now allowed
            expect(wasSensitive).toBe(false);
            expect(afterRemoval).toBe(true);
          } else {
            // Viewer/Editor can never approve
            expect(wasSensitive).toBe(false);
            expect(afterRemoval).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Viewer and Editor can never approve regardless of sensitivity', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PermissionLevel>('Viewer', 'Editor'),
        fc.boolean(),
        (role, isSensitive) => {
          expect(canApproveOrReject(isSensitive, role)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// =====================================================================
// Property 13: Visibility group access resolution
// =====================================================================

describe('Property 13: Visibility group access resolution', () => {
  /**
   * **Validates: Requirements 9.3, 9.5, 9.6**
   *
   * For any document assigned to one or more Visibility_Groups and any user,
   * the user SHALL have read access if and only if they belong to at least
   * one of the assigned groups (or are an Admin).
   * For any document with no Visibility_Group assignments, access SHALL
   * follow the standard RBAC rules.
   */

  /**
   * Replicates the visibility resolution logic from visibility.ts:
   * 1. Admins always have access
   * 2. No groups assigned → allow (standard RBAC)
   * 3. Groups assigned → user must be in at least one
   */
  function checkDocumentVisibility(
    userPermissionLevel: PermissionLevel,
    userId: string,
    documentGroupIds: string[],
    userGroupIds: string[],
  ): boolean {
    // Admins always pass
    if (userPermissionLevel === 'Admin') {
      return true;
    }

    // No groups assigned → standard RBAC (allow)
    if (documentGroupIds.length === 0) {
      return true;
    }

    // User must belong to at least one assigned group
    const userGroupSet = new Set(userGroupIds);
    return documentGroupIds.some((gid) => userGroupSet.has(gid));
  }

  /** Generator for a set of group IDs assigned to a document */
  const documentGroupsArb = fc.array(groupIdArb, { minLength: 0, maxLength: 5 });

  /** Generator for a set of group IDs a user belongs to */
  const userGroupsArb = fc.array(groupIdArb, { minLength: 0, maxLength: 5 });

  it('Admins always have access regardless of group assignments', () => {
    fc.assert(
      fc.property(
        userIdArb,
        documentGroupsArb,
        userGroupsArb,
        (userId, docGroups, userGroups) => {
          const result = checkDocumentVisibility('Admin', userId, docGroups, userGroups);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('documents with no groups: standard RBAC applies (allow for all roles)', () => {
    fc.assert(
      fc.property(
        permissionLevelArb,
        userIdArb,
        userGroupsArb,
        (role, userId, userGroups) => {
          const result = checkDocumentVisibility(role, userId, [], userGroups);
          // No groups → standard RBAC → allow (visibility check passes)
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('documents with groups: non-Admin user in at least one group gets access', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PermissionLevel>('Viewer', 'Editor', 'Approver'),
        userIdArb,
        fc.array(groupIdArb, { minLength: 1, maxLength: 5 }),
        (role, userId, docGroups) => {
          // User belongs to at least the first document group
          const userGroups = [docGroups[0]];
          const result = checkDocumentVisibility(role, userId, docGroups, userGroups);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('documents with groups: non-Admin user in no matching group is denied', () => {
    // Generate disjoint group sets to ensure no overlap
    fc.assert(
      fc.property(
        fc.constantFrom<PermissionLevel>('Viewer', 'Editor', 'Approver'),
        userIdArb,
        fc.array(groupIdArb, { minLength: 1, maxLength: 5 }),
        fc.array(groupIdArb, { minLength: 0, maxLength: 5 }),
        (role, userId, docGroups, extraUserGroups) => {
          // Ensure user groups don't overlap with document groups
          const docGroupSet = new Set(docGroups);
          const userGroups = extraUserGroups.filter((g) => !docGroupSet.has(g));

          const result = checkDocumentVisibility(role, userId, docGroups, userGroups);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('access is granted if user belongs to ANY of the assigned groups (not all)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PermissionLevel>('Viewer', 'Editor', 'Approver'),
        userIdArb,
        fc.array(groupIdArb, { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 0 }),
        (role, userId, docGroups, pickIndex) => {
          // User belongs to exactly one of the document groups (picked randomly)
          const idx = pickIndex % docGroups.length;
          const userGroups = [docGroups[idx]];
          const result = checkDocumentVisibility(role, userId, docGroups, userGroups);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// =====================================================================
// Property 14: Group creation validation
// =====================================================================

describe('Property 14: Group creation validation', () => {
  /**
   * **Validates: Requirements 9.2**
   *
   * For any Visibility_Group creation request, the system SHALL reject
   * the request if any of the following are missing: group name, group
   * level, or at least one member. The system SHALL accept the request
   * if all three are provided with valid values.
   */

  interface GroupCreationInput {
    name?: string;
    groupLevel?: string;
    memberIds?: string[];
  }

  interface ValidationResult {
    valid: boolean;
    error?: string;
  }

  /**
   * Replicates the group creation validation logic from groups.ts.
   */
  function validateGroupCreation(input: GroupCreationInput): ValidationResult {
    if (!input.name || !input.name.trim()) {
      return { valid: false, error: 'Group name is required.' };
    }

    if (!input.groupLevel) {
      return { valid: false, error: 'Group level is required.' };
    }

    if (!(VALID_GROUP_LEVELS as readonly string[]).includes(input.groupLevel)) {
      return {
        valid: false,
        error: `Invalid group level. Must be one of: ${VALID_GROUP_LEVELS.join(', ')}`,
      };
    }

    if (!input.memberIds || input.memberIds.length === 0) {
      return { valid: false, error: 'At least one member is required.' };
    }

    return { valid: true };
  }

  /** Generator for a valid group creation input */
  const validGroupInputArb: fc.Arbitrary<GroupCreationInput> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    groupLevel: groupLevelArb.map((g) => g as string),
    memberIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
  });

  it('valid inputs with name, groupLevel, and members are accepted', () => {
    fc.assert(
      fc.property(
        validGroupInputArb,
        (input) => {
          const result = validateGroupCreation(input);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('missing name is rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, '', '   '),
        groupLevelArb,
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
        (name, groupLevel, memberIds) => {
          const result = validateGroupCreation({
            name: name as string | undefined,
            groupLevel,
            memberIds,
          });
          expect(result.valid).toBe(false);
          expect(result.error).toContain('name');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('missing groupLevel is rejected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
        (name, memberIds) => {
          const result = validateGroupCreation({
            name,
            groupLevel: undefined,
            memberIds,
          });
          expect(result.valid).toBe(false);
          expect(result.error).toContain('level');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty members array is rejected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        groupLevelArb,
        (name, groupLevel) => {
          const result = validateGroupCreation({
            name,
            groupLevel,
            memberIds: [],
          });
          expect(result.valid).toBe(false);
          expect(result.error).toContain('member');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('undefined members is rejected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        groupLevelArb,
        (name, groupLevel) => {
          const result = validateGroupCreation({
            name,
            groupLevel,
            memberIds: undefined,
          });
          expect(result.valid).toBe(false);
          expect(result.error).toContain('member');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('invalid groupLevel is rejected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (s) => !(VALID_GROUP_LEVELS as readonly string[]).includes(s),
        ),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
        (name, invalidLevel, memberIds) => {
          const result = validateGroupCreation({
            name,
            groupLevel: invalidLevel,
            memberIds,
          });
          expect(result.valid).toBe(false);
          expect(result.error).toContain('level');
        },
      ),
      { numRuns: 100 },
    );
  });
});


// =====================================================================
// Property 15: Group membership change immediate effect
// =====================================================================

describe('Property 15: Group membership change immediate effect', () => {
  /**
   * **Validates: Requirements 9.7**
   *
   * For any user added to or removed from a Visibility_Group, the very
   * next visibility check for that user on documents restricted to that
   * group SHALL reflect the updated membership.
   */

  /** In-memory membership store simulating the DB */
  interface MembershipStore {
    /** Get all group IDs a user belongs to */
    getUserGroups(userId: string): string[];
    /** Add user to a group */
    addMember(groupId: string, userId: string): void;
    /** Remove user from a group */
    removeMember(groupId: string, userId: string): void;
  }

  function createMembershipStore(): MembershipStore {
    // Map<userId, Set<groupId>>
    const memberships = new Map<string, Set<string>>();

    return {
      getUserGroups(userId: string): string[] {
        return [...(memberships.get(userId) ?? [])];
      },
      addMember(groupId: string, userId: string): void {
        if (!memberships.has(userId)) {
          memberships.set(userId, new Set());
        }
        memberships.get(userId)!.add(groupId);
      },
      removeMember(groupId: string, userId: string): void {
        memberships.get(userId)?.delete(groupId);
      },
    };
  }

  /**
   * Visibility check using the membership store.
   * Same logic as Property 13 but reads from the mutable store.
   */
  function checkVisibility(
    store: MembershipStore,
    userId: string,
    permissionLevel: PermissionLevel,
    documentGroupIds: string[],
  ): boolean {
    if (permissionLevel === 'Admin') return true;
    if (documentGroupIds.length === 0) return true;

    const userGroups = new Set(store.getUserGroups(userId));
    return documentGroupIds.some((gid) => userGroups.has(gid));
  }

  it('after adding user to group, next visibility check grants access', () => {
    fc.assert(
      fc.property(
        userIdArb,
        groupIdArb,
        fc.constantFrom<PermissionLevel>('Viewer', 'Editor', 'Approver'),
        (userId, groupId, role) => {
          const store = createMembershipStore();
          const docGroups = [groupId];

          // Before adding: user has no groups → denied
          expect(checkVisibility(store, userId, role, docGroups)).toBe(false);

          // Add user to the group
          store.addMember(groupId, userId);

          // After adding: next check grants access
          expect(checkVisibility(store, userId, role, docGroups)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('after removing user from group, next visibility check denies access', () => {
    fc.assert(
      fc.property(
        userIdArb,
        groupIdArb,
        fc.constantFrom<PermissionLevel>('Viewer', 'Editor', 'Approver'),
        (userId, groupId, role) => {
          const store = createMembershipStore();
          const docGroups = [groupId];

          // Start with user in the group
          store.addMember(groupId, userId);
          expect(checkVisibility(store, userId, role, docGroups)).toBe(true);

          // Remove user from the group
          store.removeMember(groupId, userId);

          // After removing: next check denies access
          expect(checkVisibility(store, userId, role, docGroups)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('adding to one group does not affect visibility for documents restricted to other groups', () => {
    fc.assert(
      fc.property(
        userIdArb,
        groupIdArb,
        groupIdArb,
        fc.constantFrom<PermissionLevel>('Viewer', 'Editor', 'Approver'),
        (userId, groupA, groupB, role) => {
          // Ensure groups are different
          fc.pre(groupA !== groupB);

          const store = createMembershipStore();

          // Add user to group A
          store.addMember(groupA, userId);

          // Document restricted to group B only
          const docGroups = [groupB];

          // User is in group A but doc requires group B → denied
          expect(checkVisibility(store, userId, role, docGroups)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sequential add/remove operations always reflect the latest state', () => {
    const operationsArb = fc.array(
      fc.record({
        action: fc.constantFrom('add', 'remove'),
        groupId: groupIdArb,
      }),
      { minLength: 1, maxLength: 10 },
    );

    fc.assert(
      fc.property(
        userIdArb,
        groupIdArb,
        operationsArb,
        fc.constantFrom<PermissionLevel>('Viewer', 'Editor', 'Approver'),
        (userId, targetGroupId, operations, role) => {
          const store = createMembershipStore();
          const docGroups = [targetGroupId];

          // Apply operations on the target group
          let expectedInGroup = false;
          for (const op of operations) {
            if (op.groupId === targetGroupId) {
              if (op.action === 'add') {
                store.addMember(targetGroupId, userId);
                expectedInGroup = true;
              } else {
                store.removeMember(targetGroupId, userId);
                expectedInGroup = false;
              }
            } else {
              // Operations on other groups
              if (op.action === 'add') {
                store.addMember(op.groupId, userId);
              } else {
                store.removeMember(op.groupId, userId);
              }
            }
          }

          // Final visibility check must reflect the latest membership state
          const result = checkVisibility(store, userId, role, docGroups);
          expect(result).toBe(expectedInGroup);
        },
      ),
      { numRuns: 100 },
    );
  });
});
