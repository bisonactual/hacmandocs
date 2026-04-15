ALTER TABLE users ADD COLUMN group_level TEXT NOT NULL DEFAULT 'Member';

CREATE TABLE group_level_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  acting_user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  old_level TEXT NOT NULL,
  new_level TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
