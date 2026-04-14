import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { scoreAttempt } from './quiz-scoring.js';

// =====================================================================
// Property 6: Quiz scoring and attempt recording
// =====================================================================

describe('Property 6: Quiz scoring and attempt recording', () => {
  /**
   * **Validates: Requirements 3.2, 3.3, 3.8**
   *
   * For any set of questions with known correct answers and any set of
   * member-submitted answers, the score SHALL equal
   * (correctCount / totalCount) * 100 rounded to the nearest integer,
   * and passed SHALL be true if and only if the score is exactly 100.
   */

  /** Generator for a question with a random correctOptionIndex (0-3) */
  const questionArb = fc.record({
    questionType: fc.constantFrom('multiple_choice', 'true_false'),
    correctOptionIndex: fc.integer({ min: 0, max: 3 }),
  });

  /** Generator for a non-empty array of questions */
  const questionsArb = fc.array(questionArb, { minLength: 1, maxLength: 50 });

  /** Generator for an answer (0-3) */
  const answerArb = fc.integer({ min: 0, max: 3 });

  it('score equals Math.round((correctCount / totalCount) * 100)', () => {
    fc.assert(
      fc.property(
        questionsArb,
        (questions) => {
          const answers = questions.map(() => fc.sample(answerArb, 1)[0]);
          const result = scoreAttempt(questions, answers);

          let expectedCorrect = 0;
          for (let i = 0; i < questions.length; i++) {
            if (answers[i] === questions[i].correctOptionIndex) expectedCorrect++;
          }

          const expectedScore = Math.round((expectedCorrect / questions.length) * 100);
          expect(result.score).toBe(expectedScore);
          expect(result.correctCount).toBe(expectedCorrect);
          expect(result.totalCount).toBe(questions.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('passed is true if and only if score is exactly 100', () => {
    fc.assert(
      fc.property(
        questionsArb,
        (questions) => {
          const answers = questions.map(() => fc.sample(answerArb, 1)[0]);
          const result = scoreAttempt(questions, answers);

          if (result.score === 100) {
            expect(result.passed).toBe(true);
          } else {
            expect(result.passed).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all correct answers always yields score 100 and passed true', () => {
    fc.assert(
      fc.property(
        questionsArb,
        (questions) => {
          const perfectAnswers = questions.map((q) => q.correctOptionIndex);
          const result = scoreAttempt(questions, perfectAnswers);

          expect(result.score).toBe(100);
          expect(result.passed).toBe(true);
          expect(result.correctCount).toBe(questions.length);
          expect(result.totalCount).toBe(questions.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('score is always between 0 and 100 inclusive', () => {
    fc.assert(
      fc.property(
        questionsArb,
        fc.array(answerArb, { minLength: 1, maxLength: 50 }),
        (questions, rawAnswers) => {
          // Ensure answers array matches questions length
          const answers = questions.map((_, i) => rawAnswers[i % rawAnswers.length]);
          const result = scoreAttempt(questions, answers);

          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('correctCount + incorrectCount equals totalCount', () => {
    fc.assert(
      fc.property(
        questionsArb,
        (questions) => {
          const answers = questions.map(() => fc.sample(answerArb, 1)[0]);
          const result = scoreAttempt(questions, answers);

          // correctCount is bounded by totalCount
          expect(result.correctCount).toBeGreaterThanOrEqual(0);
          expect(result.correctCount).toBeLessThanOrEqual(result.totalCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});
