import type { ValidationResult } from './induction-validators.js';

/**
 * Validates a signoff submission payload.
 * Both confirmations must be true, names and username must be non-empty.
 */
export function validateSignoff(payload: {
  toolRecordId?: string;
  inducteeFullName?: string;
  inducteeUsername?: string;
  trainerConfirmed?: boolean;
  inducteeConfirmed?: boolean;
}): ValidationResult {
  if (!payload.toolRecordId || !payload.toolRecordId.trim()) {
    return { valid: false, error: 'Tool record ID is required.' };
  }

  if (!payload.inducteeFullName || !payload.inducteeFullName.trim()) {
    return { valid: false, error: 'Inductee full name is required.' };
  }

  if (!payload.inducteeUsername || !payload.inducteeUsername.trim()) {
    return { valid: false, error: 'Inductee hackspace username is required.' };
  }

  if (payload.trainerConfirmed !== true) {
    return { valid: false, error: 'Trainer must confirm the induction was completed.' };
  }

  if (payload.inducteeConfirmed !== true) {
    return { valid: false, error: 'Inductee must confirm they received the induction.' };
  }

  return { valid: true };
}

/**
 * Validates a checklist section creation/update payload.
 */
export function validateChecklistSection(payload: {
  sectionTitle?: string;
  sortOrder?: number;
}): ValidationResult {
  if (!payload.sectionTitle || !payload.sectionTitle.trim()) {
    return { valid: false, error: 'Section title is required.' };
  }

  if (payload.sortOrder != null && (!Number.isInteger(payload.sortOrder) || payload.sortOrder < 0)) {
    return { valid: false, error: 'Sort order must be a non-negative integer.' };
  }

  return { valid: true };
}

/**
 * Validates a checklist item creation/update payload.
 */
export function validateChecklistItem(payload: {
  itemText?: string;
  sortOrder?: number;
}): ValidationResult {
  if (!payload.itemText || !payload.itemText.trim()) {
    return { valid: false, error: 'Item text is required.' };
  }

  if (payload.sortOrder != null && (!Number.isInteger(payload.sortOrder) || payload.sortOrder < 0)) {
    return { valid: false, error: 'Sort order must be a non-negative integer.' };
  }

  return { valid: true };
}
