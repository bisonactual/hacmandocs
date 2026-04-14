import type { Certification, CertificationStatus, ToolRecord } from '@hacmandocs/shared';

const DAY_SECONDS = 86400;

/**
 * Creates a Certification from a passing quiz attempt or in-person signoff.
 * - If retrainingIntervalDays is set: expiresAt = completedAt + (days * 86400)
 * - Otherwise: expiresAt = null (permanent)
 *
 * Pass quizAttemptId for quiz-based certs, signoffId for in-person signoffs.
 */
export function createCertification(
  userId: string,
  toolRecord: Pick<ToolRecord, 'id' | 'retrainingIntervalDays'>,
  sourceId: string | null,
  completedAt: number,
  source: 'quiz' | 'signoff' | 'manual' = 'quiz',
): Omit<Certification, 'id'> {
  const expiresAt =
    toolRecord.retrainingIntervalDays != null
      ? completedAt + toolRecord.retrainingIntervalDays * DAY_SECONDS
      : null;

  return {
    userId,
    toolRecordId: toolRecord.id,
    quizAttemptId: source === 'quiz' ? sourceId : null,
    signoffId: source === 'signoff' ? sourceId : null,
    completedAt,
    expiresAt,
  };
}

/**
 * Recalculates the expiry date of a certification given a new retraining interval.
 * expiresAt = certification.completedAt + (newIntervalDays * 86400)
 */
export function recalculateExpiry(
  certification: Certification,
  newIntervalDays: number,
): Certification {
  return {
    ...certification,
    expiresAt: certification.completedAt + newIntervalDays * DAY_SECONDS,
  };
}

/**
 * Computes the status of a certification at a given point in time.
 * - null expiresAt → 'active' (permanent)
 * - expiresAt <= now → 'expired'
 * - expiresAt - now <= 30 days → 'expiring_soon'
 * - else → 'active'
 */
export function getCertificationStatus(
  certification: Pick<Certification, 'expiresAt'>,
  now: number,
): CertificationStatus {
  if (certification.expiresAt == null) return 'active';
  if (certification.expiresAt <= now) return 'expired';
  if (certification.expiresAt - now <= 30 * DAY_SECONDS) return 'expiring_soon';
  return 'active';
}
