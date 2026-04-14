// ── Union types / Enums ──────────────────────────────────────────────

/** Actions a user can perform within the system (Req 5) */
export type Action = 'view' | 'edit' | 'propose' | 'approve' | 'reject' | 'admin';

/** Permission levels in strict hierarchy: Admin ⊃ Approver ⊃ Editor ⊃ Viewer (Req 5.1) */
export type PermissionLevel = 'Viewer' | 'Editor' | 'Approver' | 'Admin';

/** Visibility group classification levels (Req 9.1) */
export type GroupLevel = 'Member' | 'Non_Member' | 'Team_Leader' | 'Manager' | 'Board_Member';

/** Edit proposal lifecycle states */
export type ProposalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

/** Supported authentication methods (Req 7) */
export type AuthMethod = 'oauth' | 'member';

// ── Document model ───────────────────────────────────────────────────

/** ProseMirror-compatible JSON node representing document content */
export interface DocumentNode {
  type: string;
  content?: DocumentNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

// ── Core domain interfaces ───────────────────────────────────────────

/** A user in the Docs_System (Req 5, 7) */
export interface User {
  id: string;
  email: string;
  name: string;
  username: string | null;
  authMethod: AuthMethod;
  externalId: string;
  permissionLevel: PermissionLevel;
  createdAt: number;
  updatedAt: number;
}

/** An authenticated session (Req 7.3) */
export interface Session {
  token: string;
  userId: string;
  authMethod: AuthMethod;
  expiresAt: number;
}

/** A document category / subcategory (Req 6.1) */
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
}

/** An edit proposal for a document (Req 4) */
export interface EditProposal {
  id: string;
  documentId: string;
  proposedContentJson: DocumentNode;
  sectionLocksJson: string[];
  authorId: string;
  reviewerId: string | null;
  status: ProposalStatus;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A named visibility group restricting document access (Req 9) */
export interface VisibilityGroup {
  id: string;
  name: string;
  groupLevel: GroupLevel;
  createdAt: number;
  updatedAt: number;
}

/** A notification sent to a user about a proposal event (Req 4.2, 8.3) */
export interface Notification {
  id: string;
  userId: string;
  proposalId: string;
  type: string;
  isRead: boolean;
  createdAt: number;
}

/** Result of comparing two document versions (Req 4.3) */
export interface DiffResult {
  before: DocumentNode;
  after: DocumentNode;
  changes: Array<{
    type: 'added' | 'removed' | 'modified';
    path: string;
    oldValue?: unknown;
    newValue?: unknown;
  }>;
}

/** Report generated after a bulk import operation (Req 1.3) */
export interface ImportReport {
  totalFiles: number;
  importedCount: number;
  failures: Array<{ filePath: string; reason: string }>;
  warnings: Array<{ filePath: string; content: string; reason: string }>;
}

// ── Service interfaces ───────────────────────────────────────────────

/** Converts between Markdown text and the internal document format (Req 1, 2) */
export interface MarkdownConverter {
  parseMarkdown(markdown: string): DocumentNode;
  toMarkdown(doc: DocumentNode): string;
}

// ── Tool Induction types ─────────────────────────────────────────────

/** Quiz lifecycle states */
export type QuizStatus = 'draft' | 'published' | 'archived';

/** Question types */
export type QuestionType = 'multiple_choice' | 'true_false' | 'multi_select';

/** Certification status */
export type CertificationStatus = 'active' | 'expiring_soon' | 'expired';

/** Email notification types for cert expiry */
export type ExpiryNotificationType = 'warning_14d' | 'expired' | 'post_expiry_30d';

// ── Tool Induction domain interfaces ─────────────────────────────────

export interface ToolRecord {
  id: string;
  name: string;
  imageUrl: string | null;
  quizId: string | null;
  preInductionQuizId: string | null;
  refresherQuizId: string | null;
  retrainingIntervalDays: number | null;
  areaId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Quiz {
  id: string;
  title: string;
  description: string | null;
  showWrongAnswers: boolean;
  status: QuizStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Question {
  id: string;
  quizId: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctOptionIndex: number;       // used for multiple_choice and true_false
  correctOptionIndices: number[];   // used for multi_select (multiple correct answers)
  sortOrder: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  answersJson: number[];
  score: number;
  passed: boolean;
  createdAt: number;
}

export interface Certification {
  id: string;
  userId: string;
  toolRecordId: string;
  quizAttemptId: string | null;
  signoffId: string | null;
  completedAt: number;
  expiresAt: number | null; // null for online_induction (permanent)
}

// ── Induction Checklist types ────────────────────────────────────────

export interface InductionChecklist {
  id: string;
  toolRecordId: string;
  sectionTitle: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface InductionChecklistItem {
  id: string;
  checklistId: string;
  itemText: string;
  sortOrder: number;
}

/** A checklist section with its items, used for display/printing */
export interface ChecklistSection {
  id: string;
  sectionTitle: string;
  sortOrder: number;
  items: InductionChecklistItem[];
}

// ── Induction Signoff types ──────────────────────────────────────────

export interface InductionSignoff {
  id: string;
  toolRecordId: string;
  trainerId: string;
  inducteeFullName: string;
  inducteeUsername: string;
  inducteeUserId: string | null;
  trainerConfirmed: boolean;
  inducteeConfirmed: boolean;
  signedAt: number;
  createdAt: number;
}

// ── Tool Area & Assignment types ─────────────────────────────────────

export interface ToolArea {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ToolTrainer {
  userId: string;
  toolRecordId: string;
  assignedAt: number;
}

export interface AreaLeader {
  userId: string;
  areaId: string;
  assignedAt: number;
}
