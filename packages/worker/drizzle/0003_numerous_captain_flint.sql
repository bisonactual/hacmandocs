PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`question_text` text NOT NULL,
	`question_type` text NOT NULL,
	`options_json` text NOT NULL,
	`correct_option_index` integer NOT NULL,
	`correct_option_indices_json` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "question_type_check" CHECK("__new_questions"."question_type" IN ('multiple_choice', 'true_false', 'multi_select'))
);
--> statement-breakpoint
INSERT INTO `__new_questions`("id", "quiz_id", "question_text", "question_type", "options_json", "correct_option_index", "correct_option_indices_json", "sort_order") SELECT "id", "quiz_id", "question_text", "question_type", "options_json", "correct_option_index", "correct_option_indices_json", "sort_order" FROM `questions`;--> statement-breakpoint
DROP TABLE `questions`;--> statement-breakpoint
ALTER TABLE `__new_questions` RENAME TO `questions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;