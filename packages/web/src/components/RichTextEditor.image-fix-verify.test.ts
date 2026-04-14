import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
 * Verification tests for Tasks 4.1, 4.2, 4.3:
 * - 4.1: handlePaste uses Tiptap command API (not raw ProseMirror)
 * - 4.2: handleDrop uses Tiptap command API (not raw ProseMirror)
 * - 4.3: Toolbar upload uses consistent async strategy with loading indicator
 *
 * **Validates: Requirements 2.5, 2.6, 2.11, 3.6**
 */

function createTestEditor(content?: Record<string, unknown>): Editor {
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
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  });
}

// ── Source code analysis helpers ──────────────────────────────────────

const sourceFilePath = path.resolve(__dirname, 'RichTextEditor.tsx');
const sourceCode = fs.readFileSync(sourceFilePath, 'utf-8');

// ── Task 4.1: handlePaste uses Tiptap command API ────────────────────

describe('Task 4.1 Fix Verification: handlePaste uses Tiptap command API', () => {
  it('handlePaste should NOT use raw ProseMirror view.dispatch or view.state.schema.nodes.image.create', () => {
    // Extract the handlePaste section from source
    const handlePasteMatch = sourceCode.match(/handlePaste:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{8}\},/);
    expect(handlePasteMatch).not.toBeNull();
    const handlePasteCode = handlePasteMatch![0];

    // Should NOT contain raw ProseMirror API calls
    expect(handlePasteCode).not.toContain('view.dispatch');
    expect(handlePasteCode).not.toContain('schema.nodes.image.create');
    expect(handlePasteCode).not.toContain('tr.replaceSelectionWith');
  });

  it('handlePaste should use Tiptap setImage command via editorRef', () => {
    const handlePasteMatch = sourceCode.match(/handlePaste:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{8}\},/);
    expect(handlePasteMatch).not.toBeNull();
    const handlePasteCode = handlePasteMatch![0];

    // Should use Tiptap command API via editorRef
    expect(handlePasteCode).toContain('setImage');
    expect(handlePasteCode).toContain('editorRef');
  });

  it('handlePaste should call uploadImageFile for image files', () => {
    const handlePasteMatch = sourceCode.match(/handlePaste:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{8}\},/);
    expect(handlePasteMatch).not.toBeNull();
    const handlePasteCode = handlePasteMatch![0];

    expect(handlePasteCode).toContain('uploadImageFile');
  });

  it('handlePaste should set isUploading state during upload', () => {
    const handlePasteMatch = sourceCode.match(/handlePaste:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{8}\},/);
    expect(handlePasteMatch).not.toBeNull();
    const handlePasteCode = handlePasteMatch![0];

    expect(handlePasteCode).toContain('setIsUploading(true)');
    expect(handlePasteCode).toContain('setIsUploading(false)');
  });

  it('Tiptap setImage command inserts a valid image node with correct src', () => {
    const editor = createTestEditor();
    const testUrl = 'http://localhost:8787/api/images/test-paste.png';

    editor.chain().focus().setImage({ src: testUrl }).run();

    const json = editor.getJSON();
    const imageNode = json.content?.find(
      (n: Record<string, unknown>) => n.type === 'image',
    );
    expect(imageNode).toBeDefined();
    expect((imageNode!.attrs as Record<string, unknown>)?.src).toBe(testUrl);

    editor.destroy();
  });
});

// ── Task 4.2: handleDrop uses Tiptap command API ─────────────────────

describe('Task 4.2 Fix Verification: handleDrop uses Tiptap command API', () => {
  it('handleDrop should NOT use raw ProseMirror view.dispatch or view.state.schema.nodes.image.create', () => {
    const handleDropMatch = sourceCode.match(/handleDrop:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{8}\},/);
    expect(handleDropMatch).not.toBeNull();
    const handleDropCode = handleDropMatch![0];

    // Should NOT contain raw ProseMirror API calls
    expect(handleDropCode).not.toContain('view.dispatch');
    expect(handleDropCode).not.toContain('schema.nodes.image.create');
    expect(handleDropCode).not.toContain('tr.insert');
    expect(handleDropCode).not.toContain('tr.replaceSelectionWith');
  });

  it('handleDrop should use Tiptap setImage command via editorRef', () => {
    const handleDropMatch = sourceCode.match(/handleDrop:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{8}\},/);
    expect(handleDropMatch).not.toBeNull();
    const handleDropCode = handleDropMatch![0];

    expect(handleDropCode).toContain('setImage');
    expect(handleDropCode).toContain('editorRef');
  });

  it('handleDrop should capture drop position via posAtCoords before async upload', () => {
    const handleDropMatch = sourceCode.match(/handleDrop:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{8}\},/);
    expect(handleDropMatch).not.toBeNull();
    const handleDropCode = handleDropMatch![0];

    // posAtCoords should be called BEFORE the async uploadImageFile
    const posAtCoordsIndex = handleDropCode.indexOf('posAtCoords');
    const uploadIndex = handleDropCode.indexOf('uploadImageFile');
    expect(posAtCoordsIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(-1);
    expect(posAtCoordsIndex).toBeLessThan(uploadIndex);
  });

  it('handleDrop should set isUploading state during upload', () => {
    const handleDropMatch = sourceCode.match(/handleDrop:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{8}\},/);
    expect(handleDropMatch).not.toBeNull();
    const handleDropCode = handleDropMatch![0];

    expect(handleDropCode).toContain('setIsUploading(true)');
    expect(handleDropCode).toContain('setIsUploading(false)');
  });

  it('handleDrop should fall back to current cursor if posAtCoords returns null', () => {
    const handleDropMatch = sourceCode.match(/handleDrop:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\s{8}\},/);
    expect(handleDropMatch).not.toBeNull();
    const handleDropCode = handleDropMatch![0];

    // Should have a fallback path when dropPos is null
    expect(handleDropCode).toContain('if (dropPos)');
    // The else branch should still call setImage
    const elseMatch = handleDropCode.match(/else\s*\{[\s\S]*?setImage/);
    expect(elseMatch).not.toBeNull();
  });

  it('Tiptap setTextSelection + setImage inserts image at a specific position', () => {
    const editor = createTestEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'first paragraph' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'second paragraph' }] },
      ],
    });

    const testUrl = 'http://localhost:8787/api/images/test-drop.png';

    // Set cursor to position 1 (start of first paragraph), then insert image
    editor.chain().focus().setTextSelection(1).setImage({ src: testUrl }).run();

    const json = editor.getJSON();
    const imageNode = json.content?.find(
      (n: Record<string, unknown>) => n.type === 'image',
    );
    expect(imageNode).toBeDefined();
    expect((imageNode!.attrs as Record<string, unknown>)?.src).toBe(testUrl);

    editor.destroy();
  });
});

// ── Task 4.3: Toolbar upload uses consistent async strategy ──────────

describe('Task 4.3 Fix Verification: Toolbar upload uses consistent async strategy', () => {
  it('insertImageFromFile should set isUploading state during upload', () => {
    // The Toolbar component should receive and use isUploading/setIsUploading
    expect(sourceCode).toContain('setIsUploading: (v: boolean) => void');

    // Find the insertImageFromFile function
    const insertMatch = sourceCode.match(/const insertImageFromFile = async[\s\S]*?};/);
    expect(insertMatch).not.toBeNull();
    const insertCode = insertMatch![0];

    expect(insertCode).toContain('setIsUploading(true)');
    expect(insertCode).toContain('setIsUploading(false)');
  });

  it('insertImageFromFile should use Tiptap setImage command (not raw ProseMirror)', () => {
    const insertMatch = sourceCode.match(/const insertImageFromFile = async[\s\S]*?};/);
    expect(insertMatch).not.toBeNull();
    const insertCode = insertMatch![0];

    expect(insertCode).toContain('setImage');
    expect(insertCode).toContain('editor.chain().focus().setImage');
    expect(insertCode).not.toContain('view.dispatch');
    expect(insertCode).not.toContain('schema.nodes');
  });

  it('Toolbar component receives isUploading and setIsUploading props', () => {
    // Verify the Toolbar function signature includes the new props
    expect(sourceCode).toContain('isUploading: boolean');
    expect(sourceCode).toContain('setIsUploading: (v: boolean) => void');
  });

  it('Toolbar is called with isUploading and setIsUploading props', () => {
    expect(sourceCode).toContain('isUploading={isUploading}');
    expect(sourceCode).toContain('setIsUploading={setIsUploading}');
  });

  it('editor component shows uploading indicator when isUploading is true', () => {
    // Check for the uploading indicator in the render output
    expect(sourceCode).toContain('Uploading image');
    expect(sourceCode).toContain('isUploading &&');
  });

  it('Tiptap setImage command correctly inserts image with absolute URL', () => {
    const editor = createTestEditor();
    const absoluteUrl = 'http://localhost:8787/api/images/toolbar-upload.png';

    editor.chain().focus().setImage({ src: absoluteUrl }).run();

    const json = editor.getJSON();
    const imageNode = json.content?.find(
      (n: Record<string, unknown>) => n.type === 'image',
    );
    expect(imageNode).toBeDefined();
    expect((imageNode!.attrs as Record<string, unknown>)?.src).toBe(absoluteUrl);

    editor.destroy();
  });
});

// ── Cross-cutting: editorRef pattern ─────────────────────────────────

describe('Cross-cutting: editorRef pattern for async handler access', () => {
  it('component declares editorRef to hold editor instance', () => {
    expect(sourceCode).toContain('editorRef');
    expect(sourceCode).toContain('useRef');
  });

  it('editorRef is kept in sync with editor instance', () => {
    // Should assign editor to editorRef.current after useEditor
    expect(sourceCode).toContain('editorRef.current = editor');
  });

  it('all three image paths use the same async strategy (approach B: insert at current cursor + loading indicator)', () => {
    // All three paths should use setIsUploading for loading state
    // handlePaste
    const pasteMatch = sourceCode.match(/handlePaste:[\s\S]*?setIsUploading/);
    expect(pasteMatch).not.toBeNull();

    // handleDrop
    const dropMatch = sourceCode.match(/handleDrop:[\s\S]*?setIsUploading/);
    expect(dropMatch).not.toBeNull();

    // insertImageFromFile (toolbar)
    const toolbarMatch = sourceCode.match(/insertImageFromFile[\s\S]*?setIsUploading/);
    expect(toolbarMatch).not.toBeNull();
  });
});
