ALTER TABLE tool_records ADD COLUMN doc_page_id TEXT REFERENCES documents(id);

ALTER TABLE tool_records ADD COLUMN no_induction_needed INTEGER DEFAULT 0;
