export interface ScoreResult {
  score: number;
  passed: boolean;
  correctCount: number;
  totalCount: number;
}

interface QuestionForScoring {
  questionType: string;
  correctOptionIndex: number;
  correctOptionIndicesJson?: string | null;
}

/**
 * Scores a quiz attempt. Answers can be:
 * - A single number (for multiple_choice / true_false)
 * - An array of numbers (for multi_select)
 *
 * For multi_select, the answer is correct only if the selected indices
 * exactly match the correct indices (same set, no extras, no missing).
 */
export function scoreAttempt(
  questions: QuestionForScoring[],
  answers: (number | number[])[],
): ScoreResult {
  const totalCount = questions.length;
  let correctCount = 0;

  for (let i = 0; i < totalCount; i++) {
    const q = questions[i];
    const answer = answers[i];

    if (q.questionType === 'multi_select') {
      // Multi-select: answer should be an array of indices
      const selectedIndices = Array.isArray(answer) ? [...answer].sort() : [answer];
      const correctIndices = q.correctOptionIndicesJson
        ? (JSON.parse(q.correctOptionIndicesJson) as number[]).sort()
        : [q.correctOptionIndex];

      if (
        selectedIndices.length === correctIndices.length &&
        selectedIndices.every((v, idx) => v === correctIndices[idx])
      ) {
        correctCount++;
      }
    } else {
      // Single answer: multiple_choice or true_false
      const selected = Array.isArray(answer) ? answer[0] : answer;
      if (selected === q.correctOptionIndex) {
        correctCount++;
      }
    }
  }

  const score = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
  const passed = score === 100;

  return { score, passed, correctCount, totalCount };
}
