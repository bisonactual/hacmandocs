CREATE TABLE `certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tool_record_id` text NOT NULL,
	`quiz_attempt_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tool_record_id`) REFERENCES `tool_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quiz_attempt_id`) REFERENCES `quiz_attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`certification_id` text NOT NULL,
	`notification_type` text NOT NULL,
	`sent_at` integer NOT NULL,
	`success` integer NOT NULL,
	`error_message` text,
	FOREIGN KEY (`certification_id`) REFERENCES `certifications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`question_text` text NOT NULL,
	`question_type` text NOT NULL,
	`options_json` text NOT NULL,
	`correct_option_index` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "question_type_check" CHECK("questions"."question_type" IN ('multiple_choice', 'true_false'))
);
--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`user_id` text NOT NULL,
	`answers_json` text NOT NULL,
	`score` integer NOT NULL,
	`passed` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "quiz_status_check" CHECK("quizzes"."status" IN ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `tool_records` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`quiz_id` text NOT NULL,
	`quiz_type` text NOT NULL,
	`retraining_interval_days` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quiz_type_check" CHECK("tool_records"."quiz_type" IN ('online_induction', 'refresher'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tool_records_name_unique` ON `tool_records` (`name`);--> statement-breakpoint
ALTER TABLE `users` ADD `is_trainer` integer DEFAULT 0 NOT NULL;