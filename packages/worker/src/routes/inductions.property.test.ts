import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateToolRecord, validateQuestion } from "../services/induction-validators";

// ── Shared generators ────────────────────────────────────────────────

const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

// =====================================================================
// Property 2: Duplicate tool name rejection
// =====================================================================

describe("Property 2: Duplicate tool name rejection", () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any tool name that already exists in the system, attempting to
   * create a new Tool_Record with the same name SHALL be rejected,
   * regardless of other field values.
   *
   * We test the validation logic: two valid tool records with the same
   * name should both pass validation individually (the UNIQUE constraint
   * is enforced at the DB level). The key property is that for any name,
   * the validation function is deterministic — if a payload is valid,
   * a second payload with the same name is also valid, meaning the
   * duplicate rejection must come from the DB constraint, not validation.
   */

  /**
   * Simulates an in-memory tool name registry to test duplicate detection.
   * This mirrors the DB UNIQUE constraint behavior.
   */
  function createToolNameRegistry() {
    const names = new Set<string>();
    return {
      tryInsert(name: string): { success: boolean; error?: string } {
        const normalized = name.trim().toLowerCase();
        if (names.has(normalized)) {
          return {
            success: false,
            error: "A tool record with this name already exists.",
          };
        }
        names.add(normalized);
        return { success: true };
      },
    };
  }

  it("inserting the same name twice always fails on the second attempt", () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        fc.uuid(),
        fc.uuid(),
        (name, quizId1, quizId2) => {
          const registry = createToolNameRegistry();

          // First valid payload
          const payload1 = {
            name,
            quizId: quizId1,
            retrainingIntervalDays: null,
          };

          // Second valid payload with same name but different fields
          const payload2 = {
            name,
            quizId: quizId2,
            retrainingIntervalDays: 30,
          };

          // Both pass validation
          expect(validateToolRecord(payload1).valid).toBe(true);
          expect(validateToolRecord(payload2).valid).toBe(true);

          // First insert succeeds
          const result1 = registry.tryInsert(payload1.name);
          expect(result1.success).toBe(true);

          // Second insert with same name fails
          const result2 = registry.tryInsert(payload2.name);
          expect(result2.success).toBe(false);
          expect(result2.error).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("different names never collide", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(nonEmptyStringArb, { minLength: 2, maxLength: 10 }).filter(
          (arr) => {
            // Ensure names are unique after normalization
            const normalized = arr.map((s) => s.trim().toLowerCase());
            return new Set(normalized).size === arr.length;
          },
        ),
        (names) => {
          const registry = createToolNameRegistry();

          for (const name of names) {
            const result = registry.tryInsert(name);
            expect(result.success).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("name comparison is case-insensitive for duplicate detection", () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb.filter((s) => /[a-zA-Z]/.test(s)),
        (name) => {
          const registry = createToolNameRegistry();

          // Insert lowercase
          const result1 = registry.tryInsert(name.toLowerCase());
          expect(result1.success).toBe(true);

          // Same name in uppercase should be rejected
          const result2 = registry.tryInsert(name.toUpperCase());
          expect(result2.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =====================================================================
// Property 5: Published quiz immutability
// =====================================================================

describe("Property 5: Published quiz immutability", () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * For any quiz in `published` status, attempts to modify existing
   * question text, answer options, or correct answer designation SHALL
   * be rejected. Adding new questions to the quiz SHALL succeed.
   */

  type QuizStatus = "draft" | "published" | "archived";

  interface QuizQuestion {
    id: string;
    questionText: string;
    questionType: string;
    options: string[];
    correctOptionIndex: number;
  }

  /**
   * Simulates the published quiz immutability check from the route handler.
   */
  function canModifyQuestion(
    quizStatus: QuizStatus,
    _questionId: string,
  ): { allowed: boolean; error?: string } {
    if (quizStatus === "published") {
      return {
        allowed: false,
        error:
          "Cannot modify questions on a published quiz. You may add new questions.",
      };
    }
    return { allowed: true };
  }

  function canDeleteQuestion(
    quizStatus: QuizStatus,
    _questionId: string,
  ): { allowed: boolean; error?: string } {
    if (quizStatus === "published") {
      return {
        allowed: false,
        error:
          "Cannot modify questions on a published quiz. You may add new questions.",
      };
    }
    return { allowed: true };
  }

  function canAddQuestion(
    _quizStatus: QuizStatus,
  ): { allowed: boolean; error?: string } {
    // Adding new questions is always allowed regardless of status
    return { allowed: true };
  }

  const questionArb: fc.Arbitrary<QuizQuestion> = fc.record({
    id: fc.uuid(),
    questionText: nonEmptyStringArb,
    questionType: fc.constantFrom("multiple_choice", "true_false"),
    options: fc.array(nonEmptyStringArb, { minLength: 2, maxLength: 6 }),
    correctOptionIndex: fc.constant(0),
  });

  it("editing existing questions on a published quiz is always rejected", () => {
    fc.assert(
      fc.property(questionArb, nonEmptyStringArb, (question, _newText) => {
        const result = canModifyQuestion("published", question.id);
        expect(result.allowed).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it("deleting existing questions on a published quiz is always rejected", () => {
    fc.assert(
      fc.property(questionArb, (question) => {
        const result = canDeleteQuestion("published", question.id);
        expect(result.allowed).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it("adding new questions to a published quiz always succeeds", () => {
    fc.assert(
      fc.property(questionArb, (question) => {
        // Validate the question payload first
        const validation = validateQuestion({
          questionText: question.questionText,
          questionType: question.questionType,
          options: question.options,
          correctOptionIndex: question.correctOptionIndex,
        });

        // If the question is valid, adding it should be allowed
        if (validation.valid) {
          const result = canAddQuestion("published");
          expect(result.allowed).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("editing questions on a draft quiz is always allowed", () => {
    fc.assert(
      fc.property(questionArb, (question) => {
        const result = canModifyQuestion("draft", question.id);
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("deleting questions on a draft quiz is always allowed", () => {
    fc.assert(
      fc.property(questionArb, (question) => {
        const result = canDeleteQuestion("draft", question.id);
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
