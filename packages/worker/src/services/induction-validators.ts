import type {
  Certification,
  CertificationStatus,
  QuestionType,
  ToolRecord,
} from '@hacmandocs/shared';
import { getCertificationStatus } from './certification.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const VALID_QUESTION_TYPES: readonly QuestionType[] = ['multiple_choice', 'true_false', 'multi_select'];

/**
 * Validates a tool record creation/update payload.
 * Requires: non-empty name.
 * All quiz IDs are optional (signoff-only tools don't need any).
 * If refresherQuizId is set or retrainingIntervalDays is set, both should be present.
 */
export function validateToolRecord(payload: {
  name?: string;
  quizId?: string | null;
  preInductionQuizId?: string | null;
  refresherQuizId?: string | null;
  retrainingIntervalDays?: number | null;
  areaId?: string | null;
}): ValidationResult {
  if (!payload.name || !payload.name.trim()) {
    return { valid: false, error: 'Tool name is required.' };
  }

  if (payload.refresherQuizId || payload.retrainingIntervalDays != null) {
    if (
      payload.retrainingIntervalDays == null ||
      payload.retrainingIntervalDays <= 0 ||
      !Number.isFinite(payload.retrainingIntervalDays)
    ) {
      return { valid: false, error: 'A positive retraining interval in days is required when a refresher quiz is set.' };
    }
  }

  return { valid: true };
}


/**
 * Validates a question creation/update payload.
 * Requires: non-empty questionText, valid questionType,
 * at least two options, and correctOptionIndex within bounds.
 */
export function validateQuestion(payload: {
  questionText?: string;
  questionType?: string;
  options?: string[];
  correctOptionIndex?: number;
  correctOptionIndices?: number[];
}): ValidationResult {
  if (!payload.questionText || !payload.questionText.trim()) {
    return { valid: false, error: 'Question text is required.' };
  }

  if (
    !payload.questionType ||
    !(VALID_QUESTION_TYPES as readonly string[]).includes(payload.questionType)
  ) {
    return { valid: false, error: 'Invalid question type. Must be one of: multiple_choice, true_false, multi_select.' };
  }

  if (!payload.options || !Array.isArray(payload.options) || payload.options.length < 2) {
    return { valid: false, error: 'At least two answer options are required.' };
  }

  if (payload.questionType === 'multi_select') {
    // Multi-select requires correctOptionIndices array
    if (
      !payload.correctOptionIndices ||
      !Array.isArray(payload.correctOptionIndices) ||
      payload.correctOptionIndices.length === 0
    ) {
      return { valid: false, error: 'Multi-select questions require at least one correct option index.' };
    }
    for (const idx of payload.correctOptionIndices) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= payload.options.length) {
        return { valid: false, error: 'All correct option indices must be valid indices within the options array.' };
      }
    }
  } else {
    // Single-answer types require correctOptionIndex
    if (
      payload.correctOptionIndex == null ||
      !Number.isInteger(payload.correctOptionIndex) ||
      payload.correctOptionIndex < 0 ||
      payload.correctOptionIndex >= payload.options.length
    ) {
      return { valid: false, error: 'Correct option index must be a valid index within the options array.' };
    }
  }

  return { valid: true };
}

export interface PartitionResult {
  available: ToolRecord[];
  completed: ToolRecord[];
  expired: ToolRecord[];
}

/**
 * Partitions tool records into available, completed, and expired lists
 * based on the member's certifications.
 *
 * - completed: tools where the member has an active or expiring_soon certification
 * - expired: tools where the member has an expired certification (and no active/expiring_soon one)
 * - available: tools where the member has no certification at all
 */
export function partitionMemberTools(
  toolRecords: ToolRecord[],
  certifications: Certification[],
  now: number,
): PartitionResult {
  const available: ToolRecord[] = [];
  const completed: ToolRecord[] = [];
  const expired: ToolRecord[] = [];

  // Group certifications by toolRecordId, keeping best status
  const certStatusByTool = new Map<string, CertificationStatus>();
  for (const cert of certifications) {
    const status = getCertificationStatus(cert, now);
    const existing = certStatusByTool.get(cert.toolRecordId);
    // Priority: active > expiring_soon > expired
    if (!existing || statusPriority(status) > statusPriority(existing)) {
      certStatusByTool.set(cert.toolRecordId, status);
    }
  }

  for (const tool of toolRecords) {
    const status = certStatusByTool.get(tool.id);
    if (!status) {
      available.push(tool);
    } else if (status === 'active' || status === 'expiring_soon') {
      completed.push(tool);
    } else {
      expired.push(tool);
    }
  }

  return { available, completed, expired };
}

function statusPriority(status: CertificationStatus): number {
  switch (status) {
    case 'active': return 2;
    case 'expiring_soon': return 1;
    case 'expired': return 0;
  }
}

/**
 * Sorts certifications by expiresAt ascending (soonest-to-expire first).
 * Certs with null expiresAt (permanent) are placed at the end.
 */
export function sortByExpiry(certifications: Certification[]): Certification[] {
  return [...certifications].sort((a, b) => {
    if (a.expiresAt == null && b.expiresAt == null) return 0;
    if (a.expiresAt == null) return 1;
    if (b.expiresAt == null) return -1;
    return a.expiresAt - b.expiresAt;
  });
}
