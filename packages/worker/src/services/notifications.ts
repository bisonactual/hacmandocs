import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { documents, users, notifications } from "../db/schema";

/**
 * Create in-app notification records when a proposal changes state.
 *
 * - Standard documents: notify all users with Approver or Admin permission level.
 * - Sensitive documents: notify only Admin users (exclude non-Admin Approvers).
 */
export async function createProposalNotifications(
  db: D1Database,
  proposalId: string,
  documentId: string,
): Promise<void> {
  const orm = drizzle(db);

  // Fetch the document to check sensitivity
  const [doc] = await orm
    .select({ isSensitive: documents.isSensitive })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!doc) return;

  // Fetch eligible recipients
  const allUsers = await orm
    .select({ id: users.id, permissionLevel: users.permissionLevel })
    .from(users);

  let recipients: string[];

  if (doc.isSensitive) {
    // Sensitive: only Admins
    recipients = allUsers
      .filter((u) => u.permissionLevel === "Admin")
      .map((u) => u.id);
  } else {
    // Standard: Approvers and Admins
    recipients = allUsers
      .filter(
        (u) =>
          u.permissionLevel === "Approver" || u.permissionLevel === "Admin",
      )
      .map((u) => u.id);
  }

  if (recipients.length === 0) return;

  const now = Math.floor(Date.now() / 1000);

  // Insert notification records
  const values = recipients.map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    proposalId,
    type: doc.isSensitive ? "sensitive_proposal" : "proposal",
    isRead: 0,
    createdAt: now,
  }));

  await orm.insert(notifications).values(values);
}
