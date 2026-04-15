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
    username: text("username"),
    groupLevel: text("group_level").notNull().default("Member"),
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
    check(
      "group_level_check",
      sql`${table.groupLevel} IN ('Member', 'Non_Member', 'Team_Leader', 'Manager', 'Board_Member')`
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

// ── Group Level Audit Log ─────────────────────────────────────────────

export const groupLevelAuditLog = sqliteTable("group_level_audit_log", {
  id: text("id").primaryKey(),
  actingUserId: text("acting_user_id")
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

// ── Tool Induction Tables ────────────────────────────────────────────

export const quizzes = sqliteTable(
  "quizzes",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    showWrongAnswers: integer("show_wrong_answers").notNull().default(1),
    status: text("status").notNull().default("draft"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "quiz_status_check",
      sql`${table.status} IN ('draft', 'published', 'archived')`
    ),
  ]
);

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    questionText: text("question_text").notNull(),
    questionType: text("question_type").notNull(),
    optionsJson: text("options_json").notNull(),
    correctOptionIndex: integer("correct_option_index").notNull(),
    correctOptionIndicesJson: text("correct_option_indices_json"), // JSON array for multi_select
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    check(
      "question_type_check",
      sql`${table.questionType} IN ('multiple_choice', 'true_false', 'multi_select')`
    ),
  ]
);

export const toolRecords = sqliteTable(
  "tool_records",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    imageUrl: text("image_url"),
    quizId: text("quiz_id")
      .references(() => quizzes.id),
    preInductionQuizId: text("pre_induction_quiz_id")
      .references(() => quizzes.id),
    refresherQuizId: text("refresher_quiz_id")
      .references(() => quizzes.id),
    retrainingIntervalDays: integer("retraining_interval_days"),
    areaId: text("area_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
);

export const quizAttempts = sqliteTable("quiz_attempts", {
  id: text("id").primaryKey(),
  quizId: text("quiz_id")
    .notNull()
    .references(() => quizzes.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  answersJson: text("answers_json").notNull(),
  score: integer("score").notNull(),
  passed: integer("passed").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const certifications = sqliteTable("certifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  toolRecordId: text("tool_record_id")
    .notNull()
    .references(() => toolRecords.id),
  quizAttemptId: text("quiz_attempt_id")
    .references(() => quizAttempts.id),
  signoffId: text("signoff_id"),
  completedAt: integer("completed_at").notNull(),
  expiresAt: integer("expires_at"),
});

export const notificationEmails = sqliteTable("notification_emails", {
  id: text("id").primaryKey(),
  certificationId: text("certification_id")
    .notNull()
    .references(() => certifications.id),
  notificationType: text("notification_type").notNull(),
  sentAt: integer("sent_at").notNull(),
  success: integer("success").notNull(),
  errorMessage: text("error_message"),
});

// ── Induction Checklists ─────────────────────────────────────────────

export const inductionChecklists = sqliteTable("induction_checklists", {
  id: text("id").primaryKey(),
  toolRecordId: text("tool_record_id")
    .notNull()
    .references(() => toolRecords.id),
  sectionTitle: text("section_title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const inductionChecklistItems = sqliteTable("induction_checklist_items", {
  id: text("id").primaryKey(),
  checklistId: text("checklist_id")
    .notNull()
    .references(() => inductionChecklists.id),
  itemText: text("item_text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── Induction Signoffs ───────────────────────────────────────────────

export const inductionSignoffs = sqliteTable("induction_signoffs", {
  id: text("id").primaryKey(),
  toolRecordId: text("tool_record_id")
    .notNull()
    .references(() => toolRecords.id),
  trainerId: text("trainer_id")
    .notNull()
    .references(() => users.id),
  inducteeFullName: text("inductee_full_name").notNull(),
  inducteeUsername: text("inductee_username").notNull(),
  inducteeUserId: text("inductee_user_id").references(() => users.id),
  trainerConfirmed: integer("trainer_confirmed").notNull().default(0),
  inducteeConfirmed: integer("inductee_confirmed").notNull().default(0),
  signedAt: integer("signed_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ── Tool Areas ───────────────────────────────────────────────────────

export const toolAreas = sqliteTable("tool_areas", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ── Tool Trainers (many-to-many) ─────────────────────────────────────

export const toolTrainers = sqliteTable(
  "tool_trainers",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    toolRecordId: text("tool_record_id")
      .notNull()
      .references(() => toolRecords.id),
    assignedAt: integer("assigned_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.toolRecordId] })]
);

// ── Area Leaders (many-to-many) ──────────────────────────────────────

export const areaLeaders = sqliteTable(
  "area_leaders",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    areaId: text("area_id")
      .notNull()
      .references(() => toolAreas.id),
    assignedAt: integer("assigned_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.areaId] })]
);
