import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { documentVisibility, visibilityGroupMembers } from "../db/schema";
import type { PermissionLevel } from "@hacmandocs/shared";

/**
 * Check whether a user can access a document based on visibility group
 * assignments.
 *
 * Resolution logic:
 * 1. Admins always have access.
 * 2. If the document has no visibility group assignments → allow (standard RBAC).
 * 3. If the document has group assignments → user must belong to at least one.
 *
 * Returns `true` if access is granted, `false` if denied.
 */
export async function checkDocumentVisibility(
  db: D1Database,
  userId: string,
  documentId: string,
  permissionLevel: PermissionLevel,
): Promise<boolean> {
  // Admins always pass
  if (permissionLevel === "Admin") {
    return true;
  }

  const orm = drizzle(db);

  // Get all visibility group assignments for this document
  const groupAssignments = await orm
    .select({ groupId: documentVisibility.groupId })
    .from(documentVisibility)
    .where(eq(documentVisibility.documentId, documentId));

  // No groups assigned → fall back to standard RBAC (allow)
  if (groupAssignments.length === 0) {
    return true;
  }

  // Check if user belongs to any of the assigned groups
  const userMemberships = await orm
    .select({ groupId: visibilityGroupMembers.groupId })
    .from(visibilityGroupMembers)
    .where(eq(visibilityGroupMembers.userId, userId));

  const userGroupIds = new Set(userMemberships.map((m) => m.groupId));
  const requiredGroupIds = groupAssignments.map((g) => g.groupId);

  // User must belong to at least one assigned group
  return requiredGroupIds.some((gid) => userGroupIds.has(gid));
}
