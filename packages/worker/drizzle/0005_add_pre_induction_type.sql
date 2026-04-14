-- Drop and recreate the quiz_type_check constraint to include pre_induction
-- SQLite doesn't support ALTER CHECK, so we recreate the table

CREATE TABLE tool_records_new (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL UNIQUE,
  quiz_id text NOT NULL REFERENCES quizzes(id),
  quiz_type text NOT NULL,
  retraining_interval_days integer,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  CHECK (quiz_type IN ('online_induction', 'pre_induction', 'refresher'))
);

INSERT INTO tool_records_new SELECT * FROM tool_records;
DROP TABLE tool_records;
ALTER TABLE tool_records_new RENAME TO tool_records;
