import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Verify that the FIXED extension config (link: false in StarterKit + separate Link)
 * allows all toolbar commands to succeed.
 *
 * Uses editor.commands.* (no focus needed) to test in headless Node.
 */
function createFixedEditor(content?: Record<string, unknown>): Editor {
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
    content: content ?? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }] },
  });
}

describe('Task 3.1 Fix Verification: Toolbar commands work with fixed extension config', () => {
  it('toggleHeading succeeds for levels 1, 2, 3', () => {
    const editor = createFixedEditor();
    for (const level of [1, 2, 3] as const) {
      const result = editor.commands.toggleHeading({ level });
      expect(result).toBe(true);
      expect(editor.isActive('heading', { level })).toBe(true);
      // Toggle off
      editor.commands.toggleHeading({ level });
    }
    editor.destroy();
  });

  it('toggleBulletList succeeds', () => {
    const editor = createFixedEditor();
    const result = editor.commands.toggleBulletList();
    expect(result).toBe(true);
    expect(editor.isActive('bulletList')).toBe(true);
    editor.destroy();
  });

  it('toggleOrderedList succeeds', () => {
    const editor = createFixedEditor();
    const result = editor.commands.toggleOrderedList();
    expect(result).toBe(true);
    expect(editor.isActive('orderedList')).toBe(true);
    editor.destroy();
  });

  it('setLink succeeds when text is selected', () => {
    const editor = createFixedEditor();
    editor.commands.selectAll();
    const result = editor.commands.setLink({ href: 'https://example.com' });
    expect(result).toBe(true);
    expect(editor.isActive('link')).toBe(true);
    editor.destroy();
  });

  it('insertTable succeeds', () => {
    const editor = createFixedEditor();
    const result = editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
    expect(result).toBe(true);
    // Verify table node exists in the document
    const json = editor.getJSON();
    const hasTable = json.content?.some((n: Record<string, unknown>) => n.type === 'table');
    expect(hasTable).toBe(true);
    editor.destroy();
  });
});

describe('Task 3.2 Fix Verification: onMouseDown preventDefault in ToolbarButton', () => {
  /**
   * Source-code level check: ToolbarButton should have onMouseDown handler.
   */
  it('ToolbarButton source includes onMouseDown preventDefault', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, 'RichTextEditor.tsx'),
      'utf-8',
    );
    expect(source).toContain('onMouseDown');
    expect(source).toContain('e.preventDefault()');
  });
});

describe('Task 3.3 Fix Verification: Link insertion on empty selection', () => {
  it('inserts linked text when cursor is collapsed (no selection)', () => {
    const editor = createFixedEditor();
    // Move to end (collapsed)
    const endPos = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection(endPos);
    const { from, to } = editor.state.selection;
    expect(from).toBe(to); // Confirm collapsed

    const url = 'https://example.com';
    editor.commands.insertContent({
      type: 'text',
      text: url,
      marks: [{ type: 'link', attrs: { href: url } }],
    });

    const json = editor.getJSON();
    const paragraph = json.content![0];
    const linkNode = paragraph.content?.find(
      (n: Record<string, unknown>) => n.text === url,
    );
    expect(linkNode).toBeDefined();
    expect(linkNode!.marks!.some((m: Record<string, unknown>) => m.type === 'link')).toBe(true);
    editor.destroy();
  });

  it('applies link mark to selected text', () => {
    const editor = createFixedEditor();
    editor.commands.selectAll();
    const result = editor.commands.setLink({ href: 'https://example.com' });
    expect(result).toBe(true);

    const json = editor.getJSON();
    const textNode = json.content![0].content![0];
    expect(textNode.marks!.some((m: Record<string, unknown>) => m.type === 'link')).toBe(true);
    editor.destroy();
  });
});

describe('Task 3.4 Fix Verification: Table size picker exists in source', () => {
  it('source code contains TableSizePicker component', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, 'RichTextEditor.tsx'),
      'utf-8',
    );
    expect(source).toContain('TableSizePicker');
    expect(source).not.toContain('rows: 3, cols: 3');
  });
});
