# Database Rules

- NEVER reset, drop, or recreate the production database unless absolutely critical (sky-is-falling level emergency)
- All migrations MUST be non-destructive and additive (ALTER TABLE ADD COLUMN, CREATE TABLE, etc.)
- Avoid migrations that recreate tables and copy data — use simple ALTER statements where possible
- Always use nullable columns or columns with defaults for new fields so existing rows aren't affected
- Test migrations against a local copy before applying to production
