import { describe, it, expect } from "vitest";
import { toMarkdown } from "@hacmandocs/shared";
import type { DocumentNode } from "@hacmandocs/shared";

/**
 * **Validates: Requirements 2.9**
 *
 * Verifies that a DocumentNode built with only the restricted quiz extension
 * set (headings, bold, italic, unordered list, link) converts to valid
 * markdown via toMarkdown() that the quiz renderer can handle.
 *
 * The quiz taker view uses a narrow custom parser (markdownToHtml) that
 * supports: ## headings, **bold**, *italic*, unordered lists (- item),
 * and [links](url). This test ensures the editor output is compatible.
 */
describe("Quiz editor output renders correctly via toMarkdown", () => {
  it("converts a representative quiz description to valid markdown", () => {
    const doc: DocumentNode = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Safety Induction" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Please read the following " },
            { type: "text", text: "carefully", marks: [{ type: "bold" }] },
            { type: "text", text: " before attempting the quiz." },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "This covers " },
            { type: "text", text: "important", marks: [{ type: "italic" }] },
            { type: "text", text: " safety procedures." },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Wear safety goggles" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Use ear protection" }],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See the " },
            {
              type: "text",
              text: "full guide",
              marks: [{ type: "link", attrs: { href: "https://example.com/guide" } }],
            },
            { type: "text", text: " for details." },
          ],
        },
      ],
    };

    const markdown = toMarkdown(doc);

    // Should not throw
    expect(markdown).toBeDefined();
    expect(typeof markdown).toBe("string");
    expect(markdown.length).toBeGreaterThan(0);

    // Verify heading is present
    expect(markdown).toContain("## Safety Induction");

    // Verify bold text
    expect(markdown).toMatch(/\*\*carefully\*\*/);

    // Verify italic text
    expect(markdown).toMatch(/\*important\*/);

    // Verify unordered list items (remark uses - for bullets)
    expect(markdown).toContain("- Wear safety goggles");
    expect(markdown).toContain("- Use ear protection");

    // Verify link
    expect(markdown).toContain("[full guide](https://example.com/guide)");
  });

  it("handles empty document without throwing", () => {
    const doc: DocumentNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
    };

    const markdown = toMarkdown(doc);
    expect(markdown).toBeDefined();
  });

  it("handles heading-only document", () => {
    const doc: DocumentNode = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Quiz Title" }],
        },
      ],
    };

    const markdown = toMarkdown(doc);
    expect(markdown).toContain("# Quiz Title");
  });
});
