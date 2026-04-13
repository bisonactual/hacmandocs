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
