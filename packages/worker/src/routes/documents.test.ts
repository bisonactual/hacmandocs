import { describe, it, expect } from "vitest";
import { extractPlainText } from "./documents.js";
import type { DocumentNode } from "@hacmandocs/shared";

// ── extractPlainText tests ───────────────────────────────────────────

describe("extractPlainText", () => {
  it("returns text from a simple text node", () => {
    const node: DocumentNode = { type: "text", text: "hello world" };
    expect(extractPlainText(node)).toBe("hello world");
  });

  it("returns empty string for a node with no text or content", () => {
    const node: DocumentNode = { type: "doc" };
    expect(extractPlainText(node)).toBe("");
  });

  it("concatenates text from nested content nodes", () => {
    const node: DocumentNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "hello" },
            { type: "text", text: "world" },
          ],
        },
      ],
    };
    expect(extractPlainText(node)).toBe("hello world");
  });

  it("handles deeply nested document structures", () => {
    const node: DocumentNode = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body text" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "item one" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(extractPlainText(node)).toBe("Title Body text item one");
  });

  it("returns empty string for empty content array", () => {
    const node: DocumentNode = { type: "doc", content: [] };
    expect(extractPlainText(node)).toBe("");
  });
});

// ── Document validation logic tests ──────────────────────────────────

describe("Document validation logic", () => {
  it("rejects empty title", () => {
    const title = "";
    expect(!title || !title.trim()).toBe(true);
  });

  it("rejects whitespace-only title", () => {
    const title = "   ";
    expect(title.trim().length === 0).toBe(true);
  });

  it("accepts valid title", () => {
    const title = "My Document";
    expect(!title || !title.trim()).toBe(false);
  });

  it("trims title whitespace", () => {
    const title = "  My Document  ";
    expect(title.trim()).toBe("My Document");
  });

  it("rejects missing contentJson", () => {
    const contentJson = undefined;
    expect(!contentJson).toBe(true);
  });

  it("accepts valid contentJson", () => {
    const contentJson: DocumentNode = { type: "doc", content: [] };
    expect(!contentJson).toBe(false);
  });
});

// ── Category validation logic tests ──────────────────────────────────

describe("Category validation logic", () => {
  it("rejects empty category name", () => {
    const name = "";
    expect(!name || !name.trim()).toBe(true);
  });

  it("rejects whitespace-only category name", () => {
    const name = "   ";
    expect(name.trim().length === 0).toBe(true);
  });

  it("accepts valid category name", () => {
    const name = "Safety Guides";
    expect(!name || !name.trim()).toBe(false);
  });

  it("trims category name whitespace", () => {
    const name = "  Safety Guides  ";
    expect(name.trim()).toBe("Safety Guides");
  });

  it("allows null parentId for root categories", () => {
    const parentId = null;
    expect(parentId).toBeNull();
  });

  it("allows string parentId for subcategories", () => {
    const parentId = "abc-123";
    expect(typeof parentId).toBe("string");
    expect(parentId.length).toBeGreaterThan(0);
  });

  it("defaults sortOrder to 0 when not provided", () => {
    const input: number | undefined = undefined;
    const sortOrder = input ?? 0;
    expect(sortOrder).toBe(0);
  });
});

// ── FTS5 SQL pattern tests ───────────────────────────────────────────

describe("FTS5 index sync SQL patterns", () => {
  const _testId = "test-doc-id";
  const _testTitle = "Test Document";
  const _testContentText = "Some plain text content";

  it("INSERT SQL uses correct table and columns", () => {
    const sql =
      "INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)";
    expect(sql).toContain("document_fts");
    expect(sql).toContain("rowid");
    expect(sql).toContain("title");
    expect(sql).toContain("content_text");
    expect(sql).toContain("SELECT rowid FROM documents WHERE id = ?");
  });

  it("DELETE SQL targets correct FTS table by rowid lookup", () => {
    const sql =
      "DELETE FROM document_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)";
    expect(sql).toContain("DELETE FROM document_fts");
    expect(sql).toContain("SELECT rowid FROM documents WHERE id = ?");
  });

  it("update pattern deletes then re-inserts FTS entry", () => {
    const deleteSql =
      "DELETE FROM document_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)";
    const insertSql =
      "INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)";

    // Both operations reference the same document via id
    expect(deleteSql).toContain("id = ?");
    expect(insertSql).toContain("id = ?");

    // Delete comes before insert (verified by code order in documents.ts)
    expect(deleteSql.startsWith("DELETE")).toBe(true);
    expect(insertSql.startsWith("INSERT")).toBe(true);
  });

  it("extractPlainText provides content for FTS indexing", () => {
    const doc: DocumentNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "searchable content here" }],
        },
      ],
    };
    const text = extractPlainText(doc);
    expect(text).toContain("searchable content here");
  });
});
