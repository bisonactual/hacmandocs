import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { documentVisibility, visibilityGroupMembers, visibilityGroups, categoryVisibility } from "../db/schema";
import type { PermissionLevel } from "@hacmandocs/shared";

/**
 * Rank for each group level. Higher = more privileges.
 * Manager and Board_Member always see everything.
 */
const GROUP_LEVEL_RANK: Record<string, number> = {
  Non_Member: 0,
  Member: 1,
  Team_Leader: 2,
  Manager: 3,
  Board_Member: 4,
};

/**
 * Check whether a user can access a document based on visibility group
 * assignments.
 *
 * Resolution logic:
 * 1. Admins always have access.
 * 2. If the document has no visibility group assignments → allow (standard RBAC).
 * 3. If the user's groupLevel ranks at or above any assigned group's groupLevel → allow.
 * 4. If the user is an explicit member of any assigned group → allow.
 * 5. Otherwise → deny.
 *
 * Returns `true` if access is granted, `false` if denied.
 */
export async function checkDocumentVisibility(
  db: D1Database,
  userId: string,
  documentId: string,
  permissionLevel: PermissionLevel,
  groupLevel?: string,
): Promise<boolean> {
  // Admins always pass
  if (permissionLevel === "Admin") {
    return true;
  }

  const orm = drizzle(db);

  // Get all visibility group assignments for this document, including the group's level
  const groupAssignments = await orm
    .select({ groupId: documentVisibility.groupId, groupLevel: visibilityGroups.groupLevel })
    .from(documentVisibility)
    .leftJoin(visibilityGroups, eq(documentVisibility.groupId, visibilityGroups.id))
    .where(eq(documentVisibility.documentId, documentId));

  // No groups assigned → fall back to standard RBAC (allow)
  if (groupAssignments.length === 0) {
    return true;
  }

  // Check group level hierarchy — user's level must be >= any assigned group's level
  if (groupLevel) {
    const userRank = GROUP_LEVEL_RANK[groupLevel] ?? 0;
    const matchesByLevel = groupAssignments.some((g) => {
      const requiredRank = GROUP_LEVEL_RANK[g.groupLevel ?? ""] ?? 0;
      return userRank >= requiredRank;
    });
    if (matchesByLevel) {
      return true;
    }
  }

  // Check if user is an explicit member of any assigned group
  const userMemberships = await orm
    .select({ groupId: visibilityGroupMembers.groupId })
    .from(visibilityGroupMembers)
    .where(eq(visibilityGroupMembers.userId, userId));

  const userGroupIds = new Set(userMemberships.map((m) => m.groupId));
  const requiredGroupIds = groupAssignments.map((g) => g.groupId);

  return requiredGroupIds.some((gid) => userGroupIds.has(gid));
}

/**
 * Check whether a user can access a category based on visibility group
 * assignments. Same logic as document visibility.
 */
export async function checkCategoryVisibility(
  db: D1Database,
  userId: string,
  categoryId: string,
  permissionLevel: PermissionLevel,
  groupLevel?: string,
): Promise<boolean> {
  if (permissionLevel === "Admin") {
    return true;
  }

  const orm = drizzle(db);

  const groupAssignments = await orm
    .select({ groupId: categoryVisibility.groupId, groupLevel: visibilityGroups.groupLevel })
    .from(categoryVisibility)
    .leftJoin(visibilityGroups, eq(categoryVisibility.groupId, visibilityGroups.id))
    .where(eq(categoryVisibility.categoryId, categoryId));

  if (groupAssignments.length === 0) {
    return true;
  }

  if (groupLevel) {
    const userRank = GROUP_LEVEL_RANK[groupLevel] ?? 0;
    if (groupAssignments.some((g) => userRank >= (GROUP_LEVEL_RANK[g.groupLevel ?? ""] ?? 0))) {
      return true;
    }
  }

  const userMemberships = await orm
    .select({ groupId: visibilityGroupMembers.groupId })
    .from(visibilityGroupMembers)
    .where(eq(visibilityGroupMembers.userId, userId));

  const userGroupIds = new Set(userMemberships.map((m) => m.groupId));
  return groupAssignments.some((g) => userGroupIds.has(g.groupId));
}
