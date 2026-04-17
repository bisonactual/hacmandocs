CREATE TABLE `risk_assessments` (
  `id` text PRIMARY KEY NOT NULL,
  `tool_record_id` text NOT NULL REFERENCES `tool_records`(`id`),
  `content_json` text NOT NULL,
  `status` text NOT NULL DEFAULT 'draft',
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `published_by` text REFERENCES `users`(`id`),
  `published_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  CHECK(`status` IN ('draft', 'published'))
);
