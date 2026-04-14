import type { Certification, ExpiryNotificationType } from '@hacmandocs/shared';

const DAY_SECONDS = 86400;

export interface NotificationToSend {
  certificationId: string;
  userId: string;
  toolRecordId: string;
  notificationType: ExpiryNotificationType;
}

export interface AlreadySentRecord {
  certificationId: string;
  notificationType: ExpiryNotificationType;
}

/**
 * Determines which expiry notification emails to send, with deduplication.
 *
 * Rules:
 * - warning_14d: expiresAt - now is between 0 and 14 days (cert not yet expired, within 14 days)
 * - expired: expiresAt <= now
 * - post_expiry_30d: now - expiresAt >= 30 days
 * - Dedup: skip if (certId, type) already in alreadySent
 */
export function getNotificationsToSend(
  certifications: Certification[],
  alreadySent: AlreadySentRecord[],
  now: number,
): NotificationToSend[] {
  const sentSet = new Set(
    alreadySent.map((s) => `${s.certificationId}:${s.notificationType}`),
  );

  const notifications: NotificationToSend[] = [];

  for (const cert of certifications) {
    // Only refresher certs (non-null expiresAt) get notifications
    if (cert.expiresAt == null) continue;

    const timeUntilExpiry = cert.expiresAt - now;

    const types: ExpiryNotificationType[] = [];

    // warning_14d: 0 < timeUntilExpiry <= 14 days
    if (timeUntilExpiry > 0 && timeUntilExpiry <= 14 * DAY_SECONDS) {
      types.push('warning_14d');
    }

    // expired: expiresAt <= now
    if (cert.expiresAt <= now) {
      types.push('expired');
    }

    // post_expiry_30d: now - expiresAt >= 30 days
    if (now - cert.expiresAt >= 30 * DAY_SECONDS) {
      types.push('post_expiry_30d');
    }

    for (const type of types) {
      const key = `${cert.id}:${type}`;
      if (!sentSet.has(key)) {
        notifications.push({
          certificationId: cert.id,
          userId: cert.userId,
          toolRecordId: cert.toolRecordId,
          notificationType: type,
        });
      }
    }
  }

  return notifications;
}
