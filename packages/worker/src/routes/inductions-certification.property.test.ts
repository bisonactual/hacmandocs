import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Certification } from '@hacmandocs/shared';
import { createCertification, recalculateExpiry } from '../services/certification.js';

const DAY_SECONDS = 86400;

// ── Shared generators ────────────────────────────────────────────────

const timestampArb = fc.integer({ min: 1_000_000_000, max: 1_900_000_000 });

const retrainingIntervalArb = fc.integer({ min: 1, max: 3650 });

/**
 * Generates an expired refresher certification:
 * - completedAt is some past timestamp
 * - expiresAt = completedAt + intervalDays * 86400
 * - now is after expiresAt (so the cert is expired)
 */
const expiredRefresherScenarioArb = fc.record({
  certId: fc.uuid(),
  userId: fc.uuid(),
  toolRecordId: fc.uuid(),
  quizAttemptId: fc.uuid(),
  completedAt: timestampArb,
  intervalDays: retrainingIntervalArb,
}).map((s) => {
  const expiresAt = s.completedAt + s.intervalDays * DAY_SECONDS;
  const cert: Certification = {
    id: s.certId,
    userId: s.userId,
    toolRecordId: s.toolRecordId,
    quizAttemptId: s.quizAttemptId,
    signoffId: null,
    completedAt: s.completedAt,
    expiresAt,
  };
  return { cert, intervalDays: s.intervalDays };
});

// =====================================================================
// Property 12: Certification renewal preserves history
// =====================================================================

describe('Property 12: Certification renewal preserves history', () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any expired refresher Certification, when the member passes the
   * refresher Quiz again, the system SHALL create a new Certification with
   * expiresAt = now + (intervalDays * 86400) and SHALL retain the original
   * expired Certification record unchanged.
   */

  it('renewal creates new cert with correct expiresAt = renewalTime + interval * 86400', () => {
    fc.assert(
      fc.property(
        expiredRefresherScenarioArb,
        fc.uuid(), // new quiz attempt id
        retrainingIntervalArb, // possibly updated interval
        (scenario, newAttemptId, newIntervalDays) => {
          const { cert } = scenario;

          // Simulate renewal: now is after the old cert expired
          const renewalTime = cert.expiresAt! + fc.sample(fc.integer({ min: 1, max: 365 * DAY_SECONDS }), 1)[0];

          const newCert = createCertification(
            cert.userId,
            {
              id: cert.toolRecordId,
              retrainingIntervalDays: newIntervalDays,
            },
            newAttemptId,
            renewalTime,
          );

          expect(newCert.expiresAt).toBe(renewalTime + newIntervalDays * DAY_SECONDS);
          expect(newCert.userId).toBe(cert.userId);
          expect(newCert.toolRecordId).toBe(cert.toolRecordId);
          expect(newCert.quizAttemptId).toBe(newAttemptId);
          expect(newCert.completedAt).toBe(renewalTime);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('old expired certification is preserved unchanged after renewal', () => {
    fc.assert(
      fc.property(
        expiredRefresherScenarioArb,
        fc.uuid(),
        retrainingIntervalArb,
        (scenario, newAttemptId, newIntervalDays) => {
          const { cert } = scenario;

          // Deep copy the old cert to verify it's unchanged
          const oldCertSnapshot: Certification = { ...cert };

          const renewalTime = cert.expiresAt! + 1000;

          // Create the new certification (simulating renewal)
          createCertification(
            cert.userId,
            {
              id: cert.toolRecordId,
              retrainingIntervalDays: newIntervalDays,
            },
            newAttemptId,
            renewalTime,
          );

          // The old cert must be completely unchanged
          expect(cert.id).toBe(oldCertSnapshot.id);
          expect(cert.userId).toBe(oldCertSnapshot.userId);
          expect(cert.toolRecordId).toBe(oldCertSnapshot.toolRecordId);
          expect(cert.quizAttemptId).toBe(oldCertSnapshot.quizAttemptId);
          expect(cert.completedAt).toBe(oldCertSnapshot.completedAt);
          expect(cert.expiresAt).toBe(oldCertSnapshot.expiresAt);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('new cert and old cert are distinct records (different attempt ids)', () => {
    fc.assert(
      fc.property(
        expiredRefresherScenarioArb,
        fc.uuid(),
        retrainingIntervalArb,
        (scenario, newAttemptId, newIntervalDays) => {
          const { cert } = scenario;
          const renewalTime = cert.expiresAt! + 1000;

          const newCert = createCertification(
            cert.userId,
            {
              id: cert.toolRecordId,
              retrainingIntervalDays: newIntervalDays,
            },
            newAttemptId,
            renewalTime,
          );

          // New cert has different attempt id and completedAt
          expect(newCert.quizAttemptId).toBe(newAttemptId);
          expect(newCert.quizAttemptId).not.toBe(cert.quizAttemptId);
          expect(newCert.completedAt).toBe(renewalTime);
          expect(newCert.completedAt).not.toBe(cert.completedAt);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('recalculateExpiry on renewed cert produces correct expiresAt', () => {
    fc.assert(
      fc.property(
        expiredRefresherScenarioArb,
        fc.uuid(),
        retrainingIntervalArb,
        fc.integer({ min: 1, max: 3650 }),
        (scenario, newAttemptId, renewalInterval, updatedInterval) => {
          const { cert } = scenario;
          const renewalTime = cert.expiresAt! + 1000;

          const newCertData = createCertification(
            cert.userId,
            {
              id: cert.toolRecordId,
              retrainingIntervalDays: renewalInterval,
            },
            newAttemptId,
            renewalTime,
          );

          const newCert: Certification = { id: crypto.randomUUID(), ...newCertData };

          // Recalculate with a different interval
          const recalculated = recalculateExpiry(newCert, updatedInterval);

          expect(recalculated.expiresAt).toBe(
            newCert.completedAt + updatedInterval * DAY_SECONDS,
          );
          // Original new cert unchanged
          expect(newCert.expiresAt).toBe(
            renewalTime + renewalInterval * DAY_SECONDS,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
