CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`content_json` text NOT NULL,
	`author_id` text NOT NULL,
	`approved_by` text,
	`approval_details` text,
	`version_number` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `document_visibility` (
	`document_id` text NOT NULL,
	`group_id` text NOT NULL,
	`assigned_at` integer NOT NULL,
	PRIMARY KEY(`document_id`, `group_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `visibility_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content_json` text NOT NULL,
	`category_id` text,
	`is_sensitive` integer DEFAULT 0 NOT NULL,
	`is_published` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `edit_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`proposed_content_json` text NOT NULL,
	`section_locks_json` text,
	`author_id` text NOT NULL,
	`reviewer_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`rejection_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "status_check" CHECK("edit_proposals"."status" IN ('draft', 'pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`type` text NOT NULL,
	`is_read` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `edit_proposals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `permission_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`old_level` text NOT NULL,
	`new_level` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`auth_method` text NOT NULL,
	`external_id` text NOT NULL,
	`permission_level` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "auth_method_check" CHECK("users"."auth_method" IN ('oauth', 'member')),
	CONSTRAINT "permission_level_check" CHECK("users"."permission_level" IN ('Viewer', 'Editor', 'Approver', 'Admin'))
);
--> statement-breakpoint
CREATE TABLE `visibility_group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `visibility_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `visibility_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group_level` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "group_level_check" CHECK("visibility_groups"."group_level" IN ('Member', 'Non_Member', 'Team_Leader', 'Manager', 'Board_Member'))
);
--> statement-breakpoint
CREATE VIRTUAL TABLE document_fts USING fts5(
    title,
    content_text,
    content='documents',
    content_rowid='rowid'
);
