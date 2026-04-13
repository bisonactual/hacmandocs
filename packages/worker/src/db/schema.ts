import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── Users ────────────────────────────────────────────────────────────

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    authMethod: text("auth_method").notNull(),
    externalId: text("external_id").notNull(),
    permissionLevel: text("permission_level").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "auth_method_check",
      sql`${table.authMethod} IN ('oauth', 'member')`
    ),
    check(
      "permission_level_check",
      sql`${table.permissionLevel} IN ('Viewer', 'Editor', 'Approver', 'Admin')`
    ),
  ]
);

// ── Documents ────────────────────────────────────────────────────────

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  contentJson: text("content_json").notNull(),
  categoryId: text("category_id").references(() => categories.id),
  isSensitive: integer("is_sensitive").notNull().default(0),
  isPublished: integer("is_published").notNull().default(0),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});


// ── Document Versions ────────────────────────────────────────────────

export const documentVersions = sqliteTable("document_versions", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id),
  contentJson: text("content_json").notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  approvedBy: text("approved_by").references(() => users.id),
  approvalDetails: text("approval_details"),
  versionNumber: integer("version_number").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ── Edit Proposals ───────────────────────────────────────────────────

export const editProposals = sqliteTable(
  "edit_proposals",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    proposedContentJson: text("proposed_content_json").notNull(),
    sectionLocksJson: text("section_locks_json"),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    reviewerId: text("reviewer_id").references(() => users.id),
    status: text("status").notNull().default("draft"),
    rejectionReason: text("rejection_reason"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "status_check",
      sql`${table.status} IN ('draft', 'pending', 'approved', 'rejected')`
    ),
  ]
);

// ── Categories ───────────────────────────────────────────────────────

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// ── Visibility Groups ────────────────────────────────────────────────

export const visibilityGroups = sqliteTable(
  "visibility_groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    groupLevel: text("group_level").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "group_level_check",
      sql`${table.groupLevel} IN ('Member', 'Non_Member', 'Team_Leader', 'Manager', 'Board_Member')`
    ),
  ]
);

// ── Visibility Group Members ─────────────────────────────────────────

export const visibilityGroupMembers = sqliteTable(
  "visibility_group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => visibilityGroups.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    addedAt: integer("added_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })]
);

// ── Document Visibility ──────────────────────────────────────────────

export const documentVisibility = sqliteTable(
  "document_visibility",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    groupId: text("group_id")
      .notNull()
      .references(() => visibilityGroups.id),
    assignedAt: integer("assigned_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.groupId] })]
);

// ── Permission Audit Log ─────────────────────────────────────────────

export const permissionAuditLog = sqliteTable("permission_audit_log", {
  id: text("id").primaryKey(),
  adminId: text("admin_id")
    .notNull()
    .references(() => users.id),
  targetUserId: text("target_user_id")
    .notNull()
    .references(() => users.id),
  oldLevel: text("old_level").notNull(),
  newLevel: text("new_level").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ── Notifications ────────────────────────────────────────────────────

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  proposalId: text("proposal_id")
    .notNull()
    .references(() => editProposals.id),
  type: text("type").notNull(),
  isRead: integer("is_read").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
