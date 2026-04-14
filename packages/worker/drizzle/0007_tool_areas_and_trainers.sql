PRAGMA foreign_keys = OFF;

-- Drop is_trainer from users table
CREATE TABLE users_new (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  auth_method text NOT NULL,
  external_id text NOT NULL,
  permission_level text NOT NULL,
  username text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  CHECK (auth_method IN ('oauth', 'member')),
  CHECK (permission_level IN ('Viewer', 'Editor', 'Approver', 'Admin'))
);

INSERT INTO users_new (id, email, name, auth_method, external_id, permission_level, username, created_at, updated_at)
  SELECT id, email, name, auth_method, external_id, permission_level, username, created_at, updated_at FROM users;

-- Recreate all tables that reference users
CREATE TABLE permission_audit_log_new (
  id text PRIMARY KEY NOT NULL,
  admin_id text NOT NULL REFERENCES users_new(id),
  target_user_id text NOT NULL REFERENCES users_new(id),
  old_level text NOT NULL,
  new_level text NOT NULL,
  created_at integer NOT NULL
);
INSERT INTO permission_audit_log_new SELECT * FROM permission_audit_log;

-- Drop old tables and rename
DROP TABLE permission_audit_log;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
ALTER TABLE permission_audit_log_new RENAME TO permission_audit_log;

-- Create tool_areas table first (referenced by tool_records)
CREATE TABLE tool_areas (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL UNIQUE,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

-- Recreate tool_records to make quiz_id nullable and add new quiz columns + area_id
CREATE TABLE tool_records_new (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL UNIQUE,
  quiz_id text REFERENCES quizzes(id),
  pre_induction_quiz_id text REFERENCES quizzes(id),
  refresher_quiz_id text REFERENCES quizzes(id),
  retraining_interval_days integer,
  area_id text REFERENCES tool_areas(id),
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

INSERT INTO tool_records_new (id, name, quiz_id, retraining_interval_days, created_at, updated_at)
  SELECT id, name, quiz_id, retraining_interval_days, created_at, updated_at FROM tool_records;

-- Recreate dependent tables pointing to tool_records_new
CREATE TABLE certifications_tmp (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  tool_record_id text NOT NULL REFERENCES tool_records_new(id),
  quiz_attempt_id text REFERENCES quiz_attempts(id),
  signoff_id text,
  completed_at integer NOT NULL,
  expires_at integer
);
INSERT INTO certifications_tmp SELECT * FROM certifications;

CREATE TABLE notification_emails_tmp (
  id text PRIMARY KEY NOT NULL,
  certification_id text NOT NULL REFERENCES certifications_tmp(id),
  notification_type text NOT NULL,
  sent_at integer NOT NULL,
  success integer NOT NULL,
  error_message text
);
INSERT INTO notification_emails_tmp SELECT * FROM notification_emails;

CREATE TABLE induction_checklists_tmp (
  id text PRIMARY KEY NOT NULL,
  tool_record_id text NOT NULL REFERENCES tool_records_new(id),
  section_title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
INSERT INTO induction_checklists_tmp SELECT * FROM induction_checklists;

CREATE TABLE induction_checklist_items_tmp (
  id text PRIMARY KEY NOT NULL,
  checklist_id text NOT NULL REFERENCES induction_checklists_tmp(id),
  item_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
INSERT INTO induction_checklist_items_tmp SELECT * FROM induction_checklist_items;

CREATE TABLE induction_signoffs_tmp (
  id text PRIMARY KEY NOT NULL,
  tool_record_id text NOT NULL REFERENCES tool_records_new(id),
  trainer_id text NOT NULL REFERENCES users(id),
  inductee_full_name text NOT NULL,
  inductee_username text NOT NULL,
  inductee_user_id text REFERENCES users(id),
  trainer_confirmed integer NOT NULL DEFAULT 0,
  inductee_confirmed integer NOT NULL DEFAULT 0,
  signed_at integer NOT NULL,
  created_at integer NOT NULL
);
INSERT INTO induction_signoffs_tmp SELECT * FROM induction_signoffs;

-- Drop old tables in dependency order
DROP TABLE induction_signoffs;
DROP TABLE induction_checklist_items;
DROP TABLE induction_checklists;
DROP TABLE notification_emails;
DROP TABLE certifications;
DROP TABLE tool_records;

-- Rename new tables
ALTER TABLE tool_records_new RENAME TO tool_records;
ALTER TABLE certifications_tmp RENAME TO certifications;
ALTER TABLE notification_emails_tmp RENAME TO notification_emails;
ALTER TABLE induction_checklists_tmp RENAME TO induction_checklists;
ALTER TABLE induction_checklist_items_tmp RENAME TO induction_checklist_items;
ALTER TABLE induction_signoffs_tmp RENAME TO induction_signoffs;

-- Create tool_trainers join table
CREATE TABLE tool_trainers (
  user_id text NOT NULL REFERENCES users(id),
  tool_record_id text NOT NULL REFERENCES tool_records(id),
  assigned_at integer NOT NULL,
  PRIMARY KEY (user_id, tool_record_id)
);

-- Create area_leaders join table
CREATE TABLE area_leaders (
  user_id text NOT NULL REFERENCES users(id),
  area_id text NOT NULL REFERENCES tool_areas(id),
  assigned_at integer NOT NULL,
  PRIMARY KEY (user_id, area_id)
);

PRAGMA foreign_keys = ON;
