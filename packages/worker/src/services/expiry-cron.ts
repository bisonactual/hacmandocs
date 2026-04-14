import { drizzle } from "drizzle-orm/d1";
import { eq, isNotNull } from "drizzle-orm";
import {
  certifications,
  notificationEmails,
  users,
  toolRecords,
} from "../db/schema";
import {
  getNotificationsToSend,
  type AlreadySentRecord,
} from "./expiry-notifications";
import type { Certification, ExpiryNotificationType } from "@hacmandocs/shared";

function emailSubject(type: ExpiryNotificationType): string {
  switch (type) {
    case "warning_14d":
      return "Training expiring soon";
    case "expired":
      return "Training expired";
    case "post_expiry_30d":
      return "Training certification removed";
  }
}

function emailHtml(
  type: ExpiryNotificationType,
  toolName: string,
): string {
  switch (type) {
    case "warning_14d":
      return `<p>Your certification for <strong>${toolName}</strong> is expiring within 14 days. Please retake the refresher quiz to maintain your certification.</p>`;
    case "expired":
      return `<p>Your certification for <strong>${toolName}</strong> has expired. Please retake the refresher quiz to renew your certification.</p>`;
    case "post_expiry_30d":
      return `<p>Your certification for <strong>${toolName}</strong> expired over 30 days ago and has been marked as untrained. Please retake the refresher quiz.</p>`;
  }
}

export async function processExpiryNotifications(
  env: { DB: D1Database; RESEND_API_KEY?: string },
): Promise<void> {
  const db = drizzle(env.DB);
  const now = Math.floor(Date.now() / 1000);

  // 1. Query refresher certifications (non-null expiresAt)
  const certs = await db
    .select()
    .from(certifications)
    .where(isNotNull(certifications.expiresAt));

  if (certs.length === 0) return;

  // 2. Query already-sent notification emails
  const sent = await db.select().from(notificationEmails);
  const alreadySent: AlreadySentRecord[] = sent.map((s) => ({
    certificationId: s.certificationId,
    notificationType: s.notificationType as ExpiryNotificationType,
  }));

  // 3. Determine which notifications to send
  const certsForService: Certification[] = certs.map((c) => ({
    id: c.id,
    userId: c.userId,
    toolRecordId: c.toolRecordId,
    quizAttemptId: c.quizAttemptId,
    completedAt: c.completedAt,
    expiresAt: c.expiresAt,
  }));

  const toSend = getNotificationsToSend(certsForService, alreadySent, now);
  if (toSend.length === 0) return;

  // 4. For each notification, look up user email, send email, record result
  for (const notification of toSend) {
    // Look up user email
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, notification.userId))
      .limit(1);

    if (!user?.email) continue;

    // Look up tool name
    const [tool] = await db
      .select({ name: toolRecords.name })
      .from(toolRecords)
      .where(eq(toolRecords.id, notification.toolRecordId))
      .limit(1);

    const toolName = tool?.name ?? "Unknown Tool";
    const subject = emailSubject(notification.notificationType);
    const html = emailHtml(notification.notificationType, toolName);

    let success = 1;
    let errorMessage: string | null = null;

    try {
      if (!env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured");
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "noreply@hacmandocs.org",
          to: user.email,
          subject,
          html,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Resend API error ${res.status}: ${body}`);
      }
    } catch (err) {
      success = 0;
      errorMessage =
        err instanceof Error ? err.message : "Unknown error";
    }

    // Record in notification_emails table
    await db.insert(notificationEmails).values({
      id: crypto.randomUUID(),
      certificationId: notification.certificationId,
      notificationType: notification.notificationType,
      sentAt: now,
      success,
      errorMessage,
    });
  }
}
