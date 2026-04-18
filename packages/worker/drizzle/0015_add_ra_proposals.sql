CREATE TABLE `ra_proposals` (
  `id` text PRIMARY KEY NOT NULL,
  `tool_record_id` text NOT NULL REFERENCES `tool_records`(`id`),
  `ra_id` text NOT NULL REFERENCES `risk_assessments`(`id`),
  `proposed_content_json` text NOT NULL,
  `author_id` text NOT NULL REFERENCES `users`(`id`),
  `reviewer_id` text REFERENCES `users`(`id`),
  `status` text NOT NULL DEFAULT 'pending',
  `rejection_reason` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CHECK(`status` IN ('pending', 'approved', 'rejected'))
);
