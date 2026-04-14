-- Add username column to users table
ALTER TABLE users ADD COLUMN username text;

-- Disable FK checks for table recreation
PRAGMA foreign_keys = OFF;

-- Recreate certifications table to make quiz_attempt_id nullable and add signoff_id
CREATE TABLE certifications_new (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  tool_record_id text NOT NULL REFERENCES tool_records(id),
  quiz_attempt_id text REFERENCES quiz_attempts(id),
  signoff_id text,
  completed_at integer NOT NULL,
  expires_at integer
);

INSERT INTO certifications_new (id, user_id, tool_record_id, quiz_attempt_id, completed_at, expires_at)
  SELECT id, user_id, tool_record_id, quiz_attempt_id, completed_at, expires_at FROM certifications;

-- Drop notification_emails first (depends on certifications), then recreate
CREATE TABLE notification_emails_new (
  id text PRIMARY KEY NOT NULL,
  certification_id text NOT NULL REFERENCES certifications_new(id),
  notification_type text NOT NULL,
  sent_at integer NOT NULL,
  success integer NOT NULL,
  error_message text
);

INSERT INTO notification_emails_new SELECT * FROM notification_emails;
DROP TABLE notification_emails;
DROP TABLE certifications;
ALTER TABLE certifications_new RENAME TO certifications;
ALTER TABLE notification_emails_new RENAME TO notification_emails;

PRAGMA foreign_keys = ON;

-- Create induction_checklists table (sections)
CREATE TABLE induction_checklists (
  id text PRIMARY KEY NOT NULL,
  tool_record_id text NOT NULL REFERENCES tool_records(id),
  section_title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

-- Create induction_checklist_items table
CREATE TABLE induction_checklist_items (
  id text PRIMARY KEY NOT NULL,
  checklist_id text NOT NULL REFERENCES induction_checklists(id),
  item_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

-- Create induction_signoffs table
CREATE TABLE induction_signoffs (
  id text PRIMARY KEY NOT NULL,
  tool_record_id text NOT NULL REFERENCES tool_records(id),
  trainer_id text NOT NULL REFERENCES users(id),
  inductee_full_name text NOT NULL,
  inductee_username text NOT NULL,
  inductee_user_id text REFERENCES users(id),
  trainer_confirmed integer NOT NULL DEFAULT 0,
  inductee_confirmed integer NOT NULL DEFAULT 0,
  signed_at integer NOT NULL,
  created_at integer NOT NULL
);
