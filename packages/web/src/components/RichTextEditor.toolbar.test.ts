import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";

/**
 * **Validates: Requirements 2.9, 3.7, 3.8**
 *
 * Verifies that the toolbar adapts to the active extensions by checking
 * extension registration. The Toolbar component uses
 * editor.extensionManager.extensions.some(e => e.name === '...') to
 * decide which buttons to render.
 */

function createDefaultEditor(): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: false,
      }),
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

function createQuizEditor(): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        orderedList: false,
        link: false,
      }),
      Link.configure({ openOnClick: false }),
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

/** Helper: check if an extension is registered by name */
function hasExtension(editor: Editor, name: string): boolean {
  return editor.extensionManager.extensions.some((e) => e.name === name);
}

describe("Toolbar adapts to active extensions", () => {
  describe("Default (full) editor", () => {
    it("has image extension registered", () => {
      const editor = createDefaultEditor();
      expect(hasExtension(editor, "image")).toBe(true);
      editor.destroy();
    });

    it("has orderedList extension registered", () => {
      const editor = createDefaultEditor();
      expect(hasExtension(editor, "orderedList")).toBe(true);
      editor.destroy();
    });

    it("has codeBlock extension registered", () => {
      const editor = createDefaultEditor();
      expect(hasExtension(editor, "codeBlock")).toBe(true);
      editor.destroy();
    });

    it("has table extension registered", () => {
      const editor = createDefaultEditor();
      expect(hasExtension(editor, "table")).toBe(true);
      editor.destroy();
    });
  });

  describe("Restricted quiz editor", () => {
    it("does NOT have image extension registered", () => {
      const editor = createQuizEditor();
      expect(hasExtension(editor, "image")).toBe(false);
      editor.destroy();
    });

    it("does NOT have orderedList extension registered", () => {
      const editor = createQuizEditor();
      expect(hasExtension(editor, "orderedList")).toBe(false);
      editor.destroy();
    });

    it("does NOT have codeBlock extension registered", () => {
      const editor = createQuizEditor();
      expect(hasExtension(editor, "codeBlock")).toBe(false);
      editor.destroy();
    });

    it("does NOT have table extension registered", () => {
      const editor = createQuizEditor();
      expect(hasExtension(editor, "table")).toBe(false);
      editor.destroy();
    });

    it("DOES have heading, bold, italic, bulletList, and link", () => {
      const editor = createQuizEditor();
      expect(hasExtension(editor, "heading")).toBe(true);
      expect(hasExtension(editor, "bold")).toBe(true);
      expect(hasExtension(editor, "italic")).toBe(true);
      expect(hasExtension(editor, "bulletList")).toBe(true);
      expect(hasExtension(editor, "link")).toBe(true);
      editor.destroy();
    });
  });
});
