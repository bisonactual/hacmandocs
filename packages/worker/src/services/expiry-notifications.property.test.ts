import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Certification, ExpiryNotificationType } from '@hacmandocs/shared';
import { getNotificationsToSend, type AlreadySentRecord } from './expiry-notifications.js';

const DAY_SECONDS = 86400;

// =====================================================================
// Property 13: Expiry notification scheduling with deduplication
// =====================================================================

describe('Property 13: Expiry notification scheduling with deduplication', () => {
  /**
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   *
   * For any set of refresher Certifications with varying expiry dates
   * relative to now, and any set of already-sent notification records:
   * - warning_14d for certs where 0 < expiresAt - now <= 14 days
   * - expired for certs where expiresAt <= now
   * - post_expiry_30d for certs where now - expiresAt >= 30 days
   * - No duplicate (certId, type) if already in sent records
   */

  const timestampArb = fc.integer({ min: 1_000_000_000, max: 2_000_000_000 });

  /** Generator for a refresher certification (non-null expiresAt) */
  const refresherCertArb: fc.Arbitrary<Certification> = fc.record({
    id: fc.uuid(),
    userId: fc.uuid(),
    toolRecordId: fc.uuid(),
    quizAttemptId: fc.uuid(),
    completedAt: timestampArb,
    expiresAt: timestampArb,
  });

  const certsArb = fc.array(refresherCertArb, { minLength: 0, maxLength: 20 });

  const notificationTypeArb: fc.Arbitrary<ExpiryNotificationType> =
    fc.constantFrom('warning_14d', 'expired', 'post_expiry_30d');

  it('warning_14d is produced only when 0 < expiresAt - now <= 14 days', () => {
    fc.assert(
      fc.property(
        certsArb,
        timestampArb,
        (certs, now) => {
          const notifications = getNotificationsToSend(certs, [], now);
          const warning14d = notifications.filter((n) => n.notificationType === 'warning_14d');

          for (const n of warning14d) {
            const cert = certs.find((c) => c.id === n.certificationId)!;
            const gap = cert.expiresAt! - now;
            expect(gap).toBeGreaterThan(0);
            expect(gap).toBeLessThanOrEqual(14 * DAY_SECONDS);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('expired is produced only when expiresAt <= now', () => {
    fc.assert(
      fc.property(
        certsArb,
        timestampArb,
        (certs, now) => {
          const notifications = getNotificationsToSend(certs, [], now);
          const expired = notifications.filter((n) => n.notificationType === 'expired');

          for (const n of expired) {
            const cert = certs.find((c) => c.id === n.certificationId)!;
            expect(cert.expiresAt!).toBeLessThanOrEqual(now);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('post_expiry_30d is produced only when now - expiresAt >= 30 days', () => {
    fc.assert(
      fc.property(
        certsArb,
        timestampArb,
        (certs, now) => {
          const notifications = getNotificationsToSend(certs, [], now);
          const post30 = notifications.filter((n) => n.notificationType === 'post_expiry_30d');

          for (const n of post30) {
            const cert = certs.find((c) => c.id === n.certificationId)!;
            expect(now - cert.expiresAt!).toBeGreaterThanOrEqual(30 * DAY_SECONDS);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deduplication: no notification produced if already sent', () => {
    fc.assert(
      fc.property(
        certsArb,
        timestampArb,
        (certs, now) => {
          // First pass: get all notifications
          const firstPass = getNotificationsToSend(certs, [], now);

          // Mark all as already sent
          const alreadySent: AlreadySentRecord[] = firstPass.map((n) => ({
            certificationId: n.certificationId,
            notificationType: n.notificationType,
          }));

          // Second pass: should produce nothing
          const secondPass = getNotificationsToSend(certs, alreadySent, now);
          expect(secondPass).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no duplicate (certId, type) pairs in output', () => {
    fc.assert(
      fc.property(
        certsArb,
        timestampArb,
        (certs, now) => {
          const notifications = getNotificationsToSend(certs, [], now);
          const keys = notifications.map(
            (n) => `${n.certificationId}:${n.notificationType}`,
          );
          expect(new Set(keys).size).toBe(keys.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('permanent certs (null expiresAt) never produce notifications', () => {
    const permanentCertArb: fc.Arbitrary<Certification> = fc.record({
      id: fc.uuid(),
      userId: fc.uuid(),
      toolRecordId: fc.uuid(),
      quizAttemptId: fc.uuid(),
      completedAt: timestampArb,
      expiresAt: fc.constant(null),
    });

    fc.assert(
      fc.property(
        fc.array(permanentCertArb, { minLength: 1, maxLength: 10 }),
        timestampArb,
        (certs, now) => {
          const notifications = getNotificationsToSend(certs, [], now);
          expect(notifications).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
