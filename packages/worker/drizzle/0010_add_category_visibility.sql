CREATE TABLE `category_visibility` (
	`category_id` text NOT NULL REFERENCES `categories`(`id`),
	`group_id` text NOT NULL REFERENCES `visibility_groups`(`id`),
	`assigned_at` integer NOT NULL,
	PRIMARY KEY(`category_id`, `group_id`)
);
