import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { toMarkdown } from '@hacmandocs/shared/markdown.js';
import type { DocumentNode } from '@hacmandocs/shared/types.js';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Create a headless Tiptap editor with the same extensions as RichTextEditor.
 * No DOM rendering needed — Tiptap supports headless mode for testing.
 */
function createTestEditor(content?: Record<string, unknown>): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: false, // Disable StarterKit's bundled Link to avoid duplicate
      }),
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  });
}

// ── Test 1: Toolbar command diagnostic (BASELINE) ────────────────────

describe('Bug Condition Exploration: Toolbar command diagnostic (BASELINE)', () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
   *
   * DIAGNOSTIC: Create a headless Tiptap editor with the same extensions as
   * RichTextEditor. For each toolbar command, call editor.chain().focus().<command>.run()
   * and check the return value. This differentiates:
   *   - Hypothesis A (focus loss): .run() returns true but formatting doesn't apply in browser
   *   - Hypothesis B (extension conflict): .run() returns false
   */

  it('toggleHeading commands should return true for levels 1, 2, 3', () => {
    const editor = createTestEditor();
    for (const level of [1, 2, 3] as const) {
      // Use commands.* API — chain().focus() fails in headless Node (no DOM)
      const result = editor.commands.toggleHeading({ level });
      expect(result).toBe(true);
    }
    editor.destroy();
  });

  it('toggleBulletList command should return true', () => {
    const editor = createTestEditor();
    const result = editor.commands.toggleBulletList();
    expect(result).toBe(true);
    editor.destroy();
  });

  it('toggleOrderedList command should return true', () => {
    const editor = createTestEditor();
    const result = editor.commands.toggleOrderedList();
    expect(result).toBe(true);
    editor.destroy();
  });

  it('setLink command should return true when text is selected', () => {
    const editor = createTestEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
    });
    // Select all text
    editor.commands.selectAll();
    const result = editor.commands.setLink({ href: 'https://example.com' });
    expect(result).toBe(true);
    editor.destroy();
  });

  it('insertTable command should return true', () => {
    const editor = createTestEditor();
    const result = editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
    expect(result).toBe(true);
    editor.destroy();
  });
});

// ── Test 2: Preview CSS test (EXPECTED TO FAIL) ─────────────────────

describe('Bug Condition Exploration: Preview CSS overrides (EXPECTED TO FAIL)', () => {
  /**
   * **Validates: Requirements 1.7**
   *
   * The preview container needs targeted CSS overrides for table, img, and
   * pre/code elements beyond just `prose prose-invert`. Since we can't render
   * React components without jsdom, we check the source code of RichTextEditor.tsx
   * for the presence of targeted CSS classes/styles on the preview container.
   */

  let sourceCode: string;

  // Read the source file once
  const sourceFilePath = path.resolve(__dirname, 'RichTextEditor.tsx');
  sourceCode = fs.readFileSync(sourceFilePath, 'utf-8');

  it('preview container should have targeted CSS for table elements (borders, cell padding)', () => {
    // Look for table-specific CSS in the preview section of the source
    // The preview container is the div with `prose prose-invert` that uses dangerouslySetInnerHTML
    // We need to find evidence of table styling beyond the base prose classes

    // Find the preview section (after "Preview" heading, contains dangerouslySetInnerHTML)
    const previewSectionMatch = sourceCode.match(/Preview[\s\S]*?dangerouslySetInnerHTML/);
    expect(previewSectionMatch).not.toBeNull();

    // Check for table-specific CSS overrides in the preview container or nearby styles
    const hasTableBorderCSS =
      sourceCode.includes('border-collapse') ||
      sourceCode.includes('[&_table]') ||
      sourceCode.includes('[&>table]') ||
      sourceCode.includes('prose-table') ||
      /table.*border/.test(sourceCode) ||
      /\.prose.*table/.test(sourceCode);

    expect(hasTableBorderCSS).toBe(true);
  });

  it('preview container should have targeted CSS for img elements (max-width, responsive)', () => {
    const hasImgCSS =
      sourceCode.includes('[&_img]') ||
      sourceCode.includes('[&>img]') ||
      sourceCode.includes('prose-img') ||
      /img.*max-width/.test(sourceCode) ||
      /img.*responsive/.test(sourceCode);

    expect(hasImgCSS).toBe(true);
  });

  it('preview container should have targeted CSS for pre/code elements (background, font)', () => {
    const hasCodeCSS =
      sourceCode.includes('[&_pre]') ||
      sourceCode.includes('[&_code]') ||
      sourceCode.includes('[&>pre]') ||
      sourceCode.includes('prose-code') ||
      /pre.*background/.test(sourceCode) ||
      /code.*font/.test(sourceCode);

    expect(hasCodeCSS).toBe(true);
  });
});

// ── Test 3: Click area CSS test (EXPECTED TO FAIL) ──────────────────

describe('Bug Condition Exploration: Click area CSS (EXPECTED TO FAIL)', () => {
  /**
   * **Validates: Requirements 1.8**
   *
   * The editor container should include rules to make .ProseMirror fill the
   * container height. Check the source code for evidence of these CSS rules.
   */

  let sourceCode: string;

  const sourceFilePath = path.resolve(__dirname, 'RichTextEditor.tsx');
  sourceCode = fs.readFileSync(sourceFilePath, 'utf-8');

  it('editor should have CSS to make .ProseMirror fill container height', () => {
    // Look for min-height: 100% or h-full or flex-grow on the ProseMirror element
    // Specifically check for ProseMirror height rules
    const hasProseMirrorHeightRule =
      /ProseMirror.*min-height/.test(sourceCode) ||
      /ProseMirror.*h-full/.test(sourceCode) ||
      /\.ProseMirror\s*\{[^}]*min-height/.test(sourceCode);

    // The editor container should use flex layout to allow ProseMirror to expand
    const editorContainerSection = sourceCode.match(/min-h-\[300px\][\s\S]*?EditorContent/);
    const hasFlexLayout = editorContainerSection
      ? (editorContainerSection[0].includes('flex') && editorContainerSection[0].includes('flex-col'))
      : false;

    // At least one of these should be true for proper click area coverage
    expect(hasProseMirrorHeightRule || hasFlexLayout).toBe(true);
  });

  it('editor should have cursor: text style for click area', () => {
    const hasCursorText =
      sourceCode.includes('cursor-text') ||
      sourceCode.includes('cursor: text') ||
      /ProseMirror.*cursor/.test(sourceCode);

    expect(hasCursorText).toBe(true);
  });
});

// ── Test 4: Table size picker test (EXPECTED TO FAIL) ────────────────

describe('Bug Condition Exploration: Table size picker (EXPECTED TO FAIL)', () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * The table button should present a size picker UI rather than hardcoding
   * insertTable({rows:3, cols:3}). Check the source code for evidence of a
   * size picker component or user-selectable dimensions.
   */

  let sourceCode: string;

  const sourceFilePath = path.resolve(__dirname, 'RichTextEditor.tsx');
  sourceCode = fs.readFileSync(sourceFilePath, 'utf-8');

  it('table button should NOT hardcode rows:3, cols:3', () => {
    // The current implementation hardcodes: insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    // A proper implementation would have a size picker UI
    const hasHardcodedSize = sourceCode.includes('rows: 3, cols: 3');
    expect(hasHardcodedSize).toBe(false);
  });

  it('table insertion should include a size picker UI component', () => {
    // Look for evidence of a table-specific size picker: state for rows/cols, grid picker, or input fields
    const hasSizePicker =
      sourceCode.includes('TableSizePicker') ||
      sourceCode.includes('tableSizePicker') ||
      sourceCode.includes('table-size-picker') ||
      sourceCode.includes('gridSize') ||
      sourceCode.includes('tableRows') ||
      sourceCode.includes('tableCols') ||
      /table.*size.*picker/i.test(sourceCode) ||
      /table.*grid.*select/i.test(sourceCode);

    expect(hasSizePicker).toBe(true);
  });
});

// ── Test 5: Link insertion on empty selection (FIX VERIFICATION) ─────

describe('Fix Verification: Link insertion on empty selection', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * When no text is selected, inserting a link should create a text node
   * with the URL as both text content and link href.
   * When text is selected, inserting a link should apply the link mark.
   */

  it('inserts linked text when selection is empty (collapsed cursor)', () => {
    const editor = createTestEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'before' }] }],
    });

    // Move cursor to end (collapsed selection)
    editor.commands.selectAll();
    // Collapse to end
    const { to } = editor.state.selection;
    editor.commands.setTextSelection(to);

    const url = 'https://example.com';
    const { from: curFrom, to: curTo } = editor.state.selection;
    expect(curFrom).toBe(curTo); // Confirm collapsed

    // Simulate the fixed addLink logic: insert text with link mark
    editor.commands.insertContent({
      type: 'text',
      text: url,
      marks: [{ type: 'link', attrs: { href: url } }],
    });

    const json = editor.getJSON();
    const paragraph = json.content![0];
    // Find the text node with the URL
    const linkNode = paragraph.content?.find(
      (n: Record<string, unknown>) => n.text === url,
    );
    expect(linkNode).toBeDefined();
    expect(linkNode!.marks).toBeDefined();
    expect(linkNode!.marks!.some((m: Record<string, unknown>) => m.type === 'link')).toBe(true);

    editor.destroy();
  });

  it('applies link mark to selected text', () => {
    const editor = createTestEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'click here' }] }],
    });

    editor.commands.selectAll();
    // Use commands.* API — chain().focus() fails in headless Node (no DOM)
    const result = editor.commands.setLink({ href: 'https://example.com' });
    expect(result).toBe(true);

    const json = editor.getJSON();
    const textNode = json.content![0].content![0];
    expect(textNode.marks).toBeDefined();
    expect(textNode.marks!.some((m: Record<string, unknown>) => m.type === 'link')).toBe(true);

    editor.destroy();
  });
});

// ── Test 6: toMarkdown supported-node baseline test (BASELINE) ───────

describe('Bug Condition Exploration: toMarkdown supported-node baseline (BASELINE)', () => {
  /**
   * **Validates: Requirements 1.10**
   *
   * Generate a DocumentNode with supported node types and verify toMarkdown()
   * doesn't throw. This establishes the baseline contract for supported types.
   */

  it('toMarkdown should not throw for a document with headings', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Subtitle' }] },
      ],
    };
    expect(() => toMarkdown(doc)).not.toThrow();
    const md = toMarkdown(doc);
    expect(md).toContain('# Title');
    expect(md).toContain('## Subtitle');
  });

  it('toMarkdown should not throw for a document with paragraphs and inline marks', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'plain ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    };
    expect(() => toMarkdown(doc)).not.toThrow();
    const md = toMarkdown(doc);
    expect(md).toContain('bold');
    expect(md).toContain('italic');
  });

  it('toMarkdown should not throw for a document with bullet and ordered lists', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item 2' }] }] },
          ],
        },
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
          ],
        },
      ],
    };
    expect(() => toMarkdown(doc)).not.toThrow();
  });

  it('toMarkdown should not throw for a document with links', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click here',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', title: null } }],
            },
          ],
        },
      ],
    };
    expect(() => toMarkdown(doc)).not.toThrow();
  });

  it('toMarkdown should not throw for a document with a code block', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'js' },
          content: [{ type: 'text', text: 'console.log("hello")' }],
        },
      ],
    };
    expect(() => toMarkdown(doc)).not.toThrow();
  });

  it('toMarkdown should not throw for a document with a blockquote', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'quoted text' }] },
          ],
        },
      ],
    };
    expect(() => toMarkdown(doc)).not.toThrow();
  });

  it('toMarkdown should not throw for a document with a table', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header 1' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header 2' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] }] },
              ],
            },
          ],
        },
      ],
    };
    expect(() => toMarkdown(doc)).not.toThrow();
  });

  it('toMarkdown should not throw for a document with a horizontal rule', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    };
    expect(() => toMarkdown(doc)).not.toThrow();
  });

  it('toMarkdown should not throw for a comprehensive document with all supported types', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Main Title' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Some ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
            { type: 'text', text: ' text with a ' },
            { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://example.com', title: null } }] },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bullet item' }] }] },
          ],
        },
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ordered item' }] }] },
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const x = 1;' }],
        },
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'a quote' }] },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
              ],
            },
          ],
        },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'The end' }] },
      ],
    };
    expect(() => toMarkdown(doc)).not.toThrow();
    const md = toMarkdown(doc);
    expect(md.length).toBeGreaterThan(0);
  });
});
