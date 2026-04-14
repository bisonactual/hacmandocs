import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Certification, ToolRecord } from '@hacmandocs/shared';
import {
  createCertification,
  getCertificationStatus,
  recalculateExpiry,
} from './certification.js';

const DAY_SECONDS = 86400;

// ── Shared generators ────────────────────────────────────────────────

const toolRecordArb = (hasInterval: boolean) =>
  fc.record({
    id: fc.uuid(),
    retrainingIntervalDays:
      hasInterval
        ? fc.integer({ min: 1, max: 3650 })
        : fc.constant(null),
  });

const timestampArb = fc.integer({ min: 1_000_000_000, max: 2_000_000_000 });

const certificationArb: fc.Arbitrary<Certification> = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  toolRecordId: fc.uuid(),
  quizAttemptId: fc.oneof(fc.uuid(), fc.constant(null)),
  signoffId: fc.oneof(fc.uuid(), fc.constant(null)),
  completedAt: timestampArb,
  expiresAt: fc.oneof(fc.constant(null), timestampArb),
});

const refresherCertArb: fc.Arbitrary<Certification> = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  toolRecordId: fc.uuid(),
  quizAttemptId: fc.oneof(fc.uuid(), fc.constant(null)),
  signoffId: fc.oneof(fc.uuid(), fc.constant(null)),
  completedAt: timestampArb,
  expiresAt: timestampArb,
});

// =====================================================================
// Property 7: Certification creation from passing attempt
// =====================================================================

describe('Property 7: Certification creation from passing attempt', () => {
  /**
   * **Validates: Requirements 3.4, 3.5**
   *
   * For any passing quiz attempt: if the Tool_Record is online_induction,
   * expiresAt is null; if refresher with interval N days,
   * expiresAt = completedAt + (N * 86400).
   */

  it('online_induction creates certification with null expiresAt', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        toolRecordArb(false),
        fc.uuid(),
        timestampArb,
        (userId, toolRecord, quizAttemptId, completedAt) => {
          const cert = createCertification(userId, toolRecord, quizAttemptId, completedAt);

          expect(cert.userId).toBe(userId);
          expect(cert.toolRecordId).toBe(toolRecord.id);
          expect(cert.quizAttemptId).toBe(quizAttemptId);
          expect(cert.completedAt).toBe(completedAt);
          expect(cert.expiresAt).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('refresher creates certification with expiresAt = completedAt + interval * 86400', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        toolRecordArb(true),
        fc.uuid(),
        timestampArb,
        (userId, toolRecord, quizAttemptId, completedAt) => {
          const cert = createCertification(userId, toolRecord, quizAttemptId, completedAt);

          expect(cert.expiresAt).toBe(
            completedAt + toolRecord.retrainingIntervalDays! * DAY_SECONDS,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('certification always has correct userId, toolRecordId, quizAttemptId, completedAt', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.boolean().chain((hasInterval) => toolRecordArb(hasInterval)),
        fc.uuid(),
        timestampArb,
        (userId, toolRecord, quizAttemptId, completedAt) => {
          const cert = createCertification(userId, toolRecord, quizAttemptId, completedAt);

          expect(cert.userId).toBe(userId);
          expect(cert.toolRecordId).toBe(toolRecord.id);
          expect(cert.quizAttemptId).toBe(quizAttemptId);
          expect(cert.signoffId).toBeNull();
          expect(cert.completedAt).toBe(completedAt);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('signoff source sets signoffId and nulls quizAttemptId', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.boolean().chain((hasInterval) => toolRecordArb(hasInterval)),
        fc.uuid(),
        timestampArb,
        (userId, toolRecord, signoffId, completedAt) => {
          const cert = createCertification(userId, toolRecord, signoffId, completedAt, 'signoff');

          expect(cert.userId).toBe(userId);
          expect(cert.toolRecordId).toBe(toolRecord.id);
          expect(cert.quizAttemptId).toBeNull();
          expect(cert.signoffId).toBe(signoffId);
          expect(cert.completedAt).toBe(completedAt);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// =====================================================================
// Property 8: Certification status computation
// =====================================================================

describe('Property 8: Certification status computation', () => {
  /**
   * **Validates: Requirements 4.3, 4.4, 7.1, 7.4**
   *
   * For any Certification and timestamp now:
   * - null expiresAt → 'active'
   * - expiresAt <= now → 'expired'
   * - expiresAt - now <= 30 * 86400 → 'expiring_soon'
   * - else → 'active'
   */

  it('null expiresAt always returns active', () => {
    fc.assert(
      fc.property(
        timestampArb,
        (now) => {
          const cert = { expiresAt: null };
          expect(getCertificationStatus(cert, now)).toBe('active');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('expiresAt <= now returns expired', () => {
    fc.assert(
      fc.property(
        timestampArb,
        fc.integer({ min: 0, max: 500_000_000 }),
        (now, offset) => {
          const expiresAt = now - offset; // expiresAt <= now
          const cert = { expiresAt };
          expect(getCertificationStatus(cert, now)).toBe('expired');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('expiresAt - now in (0, 30 days] returns expiring_soon', () => {
    fc.assert(
      fc.property(
        timestampArb,
        fc.integer({ min: 1, max: 30 * DAY_SECONDS }),
        (now, gap) => {
          const expiresAt = now + gap;
          const cert = { expiresAt };
          expect(getCertificationStatus(cert, now)).toBe('expiring_soon');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('expiresAt - now > 30 days returns active', () => {
    fc.assert(
      fc.property(
        timestampArb,
        fc.integer({ min: 30 * DAY_SECONDS + 1, max: 365 * DAY_SECONDS }),
        (now, gap) => {
          const expiresAt = now + gap;
          const cert = { expiresAt };
          expect(getCertificationStatus(cert, now)).toBe('active');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('status is always one of active, expiring_soon, expired', () => {
    fc.assert(
      fc.property(
        certificationArb,
        timestampArb,
        (cert, now) => {
          const status = getCertificationStatus(cert, now);
          expect(['active', 'expiring_soon', 'expired']).toContain(status);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =====================================================================
// Property 3: Retraining interval recalculation
// =====================================================================

describe('Property 3: Retraining interval recalculation', () => {
  /**
   * **Validates: Requirements 1.6**
   *
   * For any refresher-type certification with a completedAt timestamp
   * and a new interval in days, recalculateExpiry SHALL set
   * expiresAt = completedAt + (newIntervalDays * 86400).
   */

  it('recalculated expiresAt equals completedAt + newIntervalDays * 86400', () => {
    fc.assert(
      fc.property(
        refresherCertArb,
        fc.integer({ min: 1, max: 3650 }),
        (cert, newIntervalDays) => {
          const updated = recalculateExpiry(cert, newIntervalDays);

          expect(updated.expiresAt).toBe(
            cert.completedAt + newIntervalDays * DAY_SECONDS,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('recalculation preserves all other certification fields', () => {
    fc.assert(
      fc.property(
        refresherCertArb,
        fc.integer({ min: 1, max: 3650 }),
        (cert, newIntervalDays) => {
          const updated = recalculateExpiry(cert, newIntervalDays);

          expect(updated.id).toBe(cert.id);
          expect(updated.userId).toBe(cert.userId);
          expect(updated.toolRecordId).toBe(cert.toolRecordId);
          expect(updated.quizAttemptId).toBe(cert.quizAttemptId);
          expect(updated.completedAt).toBe(cert.completedAt);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('different intervals produce different expiresAt values', () => {
    fc.assert(
      fc.property(
        refresherCertArb,
        fc.integer({ min: 1, max: 1825 }),
        fc.integer({ min: 1826, max: 3650 }),
        (cert, interval1, interval2) => {
          const updated1 = recalculateExpiry(cert, interval1);
          const updated2 = recalculateExpiry(cert, interval2);

          expect(updated1.expiresAt).not.toBe(updated2.expiresAt);
        },
      ),
      { numRuns: 100 },
    );
  });
});
