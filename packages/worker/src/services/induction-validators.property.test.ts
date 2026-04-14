import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  Certification,
  QuestionType,
  ToolRecord,
} from '@hacmandocs/shared';
import {
  validateToolRecord,
  validateQuestion,
  partitionMemberTools,
  sortByExpiry,
} from './induction-validators.js';

const DAY_SECONDS = 86400;

// ── Shared generators ────────────────────────────────────────────────

const questionTypeArb: fc.Arbitrary<QuestionType> = fc.constantFrom('multiple_choice', 'true_false');
const timestampArb = fc.integer({ min: 1_000_000_000, max: 2_000_000_000 });
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

// =====================================================================
// Property 1: Tool record validation
// =====================================================================

describe('Property 1: Tool record validation', () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3**
   *
   * For any tool record creation payload, the system SHALL accept it
   * if and only if it has a non-empty name. If refresherQuizId or
   * retrainingIntervalDays is set, the interval must be positive.
   */

  it('valid refresher payloads are accepted', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        fc.uuid(),
        fc.integer({ min: 1, max: 3650 }),
        (name, refresherQuizId, interval) => {
          const result = validateToolRecord({
            name,
            refresherQuizId,
            retrainingIntervalDays: interval,
          });
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid payloads without retraining are accepted', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        fc.uuid(),
        (name, quizId) => {
          const result = validateToolRecord({
            name,
            quizId,
            retrainingIntervalDays: null,
          });
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('missing or empty name is rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, '', '   '),
        fc.uuid(),
        (name, quizId) => {
          const result = validateToolRecord({
            name: name as string | undefined,
            quizId,
            retrainingIntervalDays: null,
          });
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('refresher with non-positive interval is rejected', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        fc.uuid(),
        fc.constantFrom(0, -1, -100, null, undefined),
        (name, refresherQuizId, badInterval) => {
          const result = validateToolRecord({
            name,
            refresherQuizId,
            retrainingIntervalDays: badInterval as number | null | undefined,
          });
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// =====================================================================
// Property 4: Question validation
// =====================================================================

describe('Property 4: Question validation', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any question creation payload, the system SHALL accept it if and
   * only if it has non-empty question text, a valid question type,
   * at least two answer options, and a correct option index that is a
   * valid index within the options array.
   */

  /** Generator for a valid options array (2-6 options) */
  const optionsArb = fc.array(nonEmptyStringArb, { minLength: 2, maxLength: 6 });

  it('valid question payloads are accepted', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        questionTypeArb,
        optionsArb,
        (questionText, questionType, options) => {
          const correctOptionIndex = Math.floor(Math.random() * options.length);
          const result = validateQuestion({
            questionText,
            questionType,
            options,
            correctOptionIndex,
          });
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('missing or empty question text is rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, '', '   '),
        questionTypeArb,
        optionsArb,
        (questionText, questionType, options) => {
          const result = validateQuestion({
            questionText: questionText as string | undefined,
            questionType,
            options,
            correctOptionIndex: 0,
          });
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('invalid question type is rejected', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter(
          (s) => s !== 'multiple_choice' && s !== 'true_false',
        ),
        optionsArb,
        (questionText, badType, options) => {
          const result = validateQuestion({
            questionText,
            questionType: badType,
            options,
            correctOptionIndex: 0,
          });
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('fewer than two options is rejected', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        questionTypeArb,
        fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 1 }),
        (questionText, questionType, options) => {
          const result = validateQuestion({
            questionText,
            questionType,
            options,
            correctOptionIndex: 0,
          });
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('correctOptionIndex out of bounds is rejected', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        questionTypeArb,
        optionsArb,
        (questionText, questionType, options) => {
          // Test with index >= options.length
          const result = validateQuestion({
            questionText,
            questionType,
            options,
            correctOptionIndex: options.length,
          });
          expect(result.valid).toBe(false);

          // Test with negative index
          const result2 = validateQuestion({
            questionText,
            questionType,
            options,
            correctOptionIndex: -1,
          });
          expect(result2.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =====================================================================
// Property 9: Member profile available vs completed partitioning
// =====================================================================

describe('Property 9: Member profile available vs completed partitioning', () => {
  /**
   * **Validates: Requirements 4.1, 4.2**
   *
   * For any member and any set of Tool_Records and Certifications,
   * the available, completed, and expired lists SHALL have no overlaps
   * and their union SHALL equal the full set of Tool_Records.
   */

  const toolRecordArb: fc.Arbitrary<ToolRecord> = fc.record({
    id: fc.uuid(),
    name: nonEmptyStringArb,
    imageUrl: fc.oneof(fc.constant(null), fc.webUrl()),
    quizId: fc.oneof(fc.uuid(), fc.constant(null)),
    preInductionQuizId: fc.oneof(fc.uuid(), fc.constant(null)),
    refresherQuizId: fc.oneof(fc.uuid(), fc.constant(null)),
    retrainingIntervalDays: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 365 })),
    areaId: fc.oneof(fc.uuid(), fc.constant(null)),
    createdAt: timestampArb,
    updatedAt: timestampArb,
  });

  const toolRecordsArb = fc.array(toolRecordArb, { minLength: 0, maxLength: 15 });

  it('available + completed + expired covers all tool records with no overlaps', () => {
    fc.assert(
      fc.property(
        toolRecordsArb,
        timestampArb,
        (toolRecords, now) => {
          // Make tool IDs unique
          const uniqueTools = toolRecords.filter(
            (t, i, arr) => arr.findIndex((x) => x.id === t.id) === i,
          );

          // Generate some certifications for a subset of tools
          const certs: Certification[] = uniqueTools
            .filter(() => Math.random() > 0.4)
            .map((tool) => ({
              id: crypto.randomUUID(),
              userId: 'user-1',
              toolRecordId: tool.id,
              quizAttemptId: crypto.randomUUID(),
              signoffId: null,
              completedAt: now - 60 * DAY_SECONDS,
              expiresAt:
                tool.retrainingIntervalDays != null
                  ? now + Math.floor((Math.random() - 0.3) * 90 * DAY_SECONDS)
                  : null,
            }));

          const { available, completed, expired } = partitionMemberTools(
            uniqueTools,
            certs,
            now,
          );

          // Union covers all tools
          const allIds = new Set(uniqueTools.map((t) => t.id));
          const partitionedIds = new Set([
            ...available.map((t) => t.id),
            ...completed.map((t) => t.id),
            ...expired.map((t) => t.id),
          ]);
          expect(partitionedIds).toEqual(allIds);

          // No overlaps
          const availableIds = new Set(available.map((t) => t.id));
          const completedIds = new Set(completed.map((t) => t.id));
          const expiredIds = new Set(expired.map((t) => t.id));

          for (const id of availableIds) {
            expect(completedIds.has(id)).toBe(false);
            expect(expiredIds.has(id)).toBe(false);
          }
          for (const id of completedIds) {
            expect(expiredIds.has(id)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('tools with no certifications are in available', () => {
    fc.assert(
      fc.property(
        toolRecordsArb,
        timestampArb,
        (toolRecords, now) => {
          const uniqueTools = toolRecords.filter(
            (t, i, arr) => arr.findIndex((x) => x.id === t.id) === i,
          );

          const { available } = partitionMemberTools(uniqueTools, [], now);
          expect(available).toHaveLength(uniqueTools.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =====================================================================
// Property 10: Refresher certification sorting
// =====================================================================

describe('Property 10: Refresher certification sorting', () => {
  /**
   * **Validates: Requirements 4.5**
   *
   * For any list of refresher-type Certifications, sortByExpiry SHALL
   * return them sorted by expiresAt in ascending order.
   */

  const refresherCertArb: fc.Arbitrary<Certification> = fc.record({
    id: fc.uuid(),
    userId: fc.uuid(),
    toolRecordId: fc.uuid(),
    quizAttemptId: fc.uuid(),
    signoffId: fc.oneof(fc.uuid(), fc.constant(null)),
    completedAt: timestampArb,
    expiresAt: timestampArb,
  });

  const certsArb = fc.array(refresherCertArb, { minLength: 0, maxLength: 30 });

  it('sorted certifications have ascending expiresAt', () => {
    fc.assert(
      fc.property(
        certsArb,
        (certs) => {
          const sorted = sortByExpiry(certs);

          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].expiresAt!).toBeGreaterThanOrEqual(sorted[i - 1].expiresAt!);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sorting preserves all certifications (no items lost)', () => {
    fc.assert(
      fc.property(
        certsArb,
        (certs) => {
          const sorted = sortByExpiry(certs);
          expect(sorted).toHaveLength(certs.length);

          const inputIds = new Set(certs.map((c) => c.id));
          const outputIds = new Set(sorted.map((c) => c.id));
          expect(outputIds).toEqual(inputIds);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('permanent certs (null expiresAt) are placed at the end', () => {
    const mixedCertArb: fc.Arbitrary<Certification> = fc.record({
      id: fc.uuid(),
      userId: fc.uuid(),
      toolRecordId: fc.uuid(),
      quizAttemptId: fc.uuid(),
      signoffId: fc.oneof(fc.uuid(), fc.constant(null)),
      completedAt: timestampArb,
      expiresAt: fc.oneof(fc.constant(null), timestampArb),
    });

    fc.assert(
      fc.property(
        fc.array(mixedCertArb, { minLength: 1, maxLength: 20 }),
        (certs) => {
          const sorted = sortByExpiry(certs);

          let seenNull = false;
          for (const cert of sorted) {
            if (cert.expiresAt == null) {
              seenNull = true;
            } else if (seenNull) {
              // A non-null expiresAt after a null one means wrong order
              expect.unreachable('Non-null expiresAt found after null expiresAt');
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sorting does not mutate the original array', () => {
    fc.assert(
      fc.property(
        certsArb,
        (certs) => {
          const original = [...certs];
          sortByExpiry(certs);

          expect(certs).toEqual(original);
        },
      ),
      { numRuns: 100 },
    );
  });
});
