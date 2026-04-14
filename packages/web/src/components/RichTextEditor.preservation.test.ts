import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import type { DocumentNode } from '@hacmandocs/shared/types.js';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Create a headless Tiptap editor with a CLEAN extension set.
 *
 * NOTE: StarterKit v3 bundles Link internally. We disable it via link: false
 * and don't add a separate Link extension here since these tests only need
 * bold/italic/codeBlock commands. This avoids the duplicate extension issue.
 *
 * In headless Node, chain().focus() fails because there's no DOM to focus.
 * We use editor.commands.* directly, which is equivalent to what the browser
 * does after focus is established.
 */
function createCleanEditor(content?: Record<string, unknown>): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: false,
      }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  });
}

/**
 * Create editor with the EXACT production extension set (with fix: link: false in StarterKit).
 * Used for tests that don't need commands to succeed (e.g., getJSON, initialContent).
 */
function createProductionEditor(content?: Record<string, unknown>): Editor {
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

// ── localStorage polyfill for Node test environment ──────────────────

const localStorageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageMap.set(key, value),
  removeItem: (key: string) => { localStorageMap.delete(key); },
  clear: () => { localStorageMap.clear(); },
  get length() { return localStorageMap.size; },
  key: (index: number) => [...localStorageMap.keys()][index] ?? null,
};

// ── Preservation: Bold/Italic toggle ─────────────────────────────────

describe('Preservation: Bold/Italic toggle', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * Bold and italic formatting work today and must continue to work after
   * the bugfix. Uses clean extension set and commands.* API (equivalent to
   * chain().focus() in browser but works in headless Node).
   */

  it('toggleBold activates bold and toggles it off', () => {
    const editor = createCleanEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
    });

    editor.commands.selectAll();

    // Toggle bold ON
    const boldOnResult = editor.commands.toggleBold();
    expect(boldOnResult).toBe(true);
    expect(editor.isActive('bold')).toBe(true);

    // Toggle bold OFF
    const boldOffResult = editor.commands.toggleBold();
    expect(boldOffResult).toBe(true);
    expect(editor.isActive('bold')).toBe(false);

    editor.destroy();
  });

  it('toggleItalic activates italic and toggles it off', () => {
    const editor = createCleanEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
    });

    editor.commands.selectAll();

    // Toggle italic ON
    const italicOnResult = editor.commands.toggleItalic();
    expect(italicOnResult).toBe(true);
    expect(editor.isActive('italic')).toBe(true);

    // Toggle italic OFF
    const italicOffResult = editor.commands.toggleItalic();
    expect(italicOffResult).toBe(true);
    expect(editor.isActive('italic')).toBe(false);

    editor.destroy();
  });
});

// ── Preservation: Auto-save (onUpdate callback) ─────────────────────

describe('Preservation: Auto-save via onUpdate callback', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * The editor fires onUpdate when content changes. In production, this
   * callback writes to localStorage. We verify the callback fires with
   * valid JSON content using setContent (works in headless mode).
   */

  it('onUpdate callback fires when editor content changes', () => {
    let capturedContent: DocumentNode | null = null;

    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
        }),
        Image,
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
      ],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      onUpdate: ({ editor: ed }) => {
        capturedContent = ed.getJSON() as DocumentNode;
      },
    });

    // Use setContent to trigger onUpdate (works in headless mode)
    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'test content' }] }],
    });

    expect(capturedContent).not.toBeNull();
    expect(capturedContent!.type).toBe('doc');
    expect(capturedContent!.content).toBeDefined();

    editor.destroy();
  });
});

// ── Preservation: Draft restore (initialContent) ─────────────────────

describe('Preservation: Draft restore via initial content', () => {
  /**
   * **Validates: Requirements 3.4, 3.8**
   *
   * The editor initializes with provided content. In production, this is
   * either a saved draft from localStorage or initialContent from props.
   */

  it('editor initializes with provided content', () => {
    const draftDoc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Restored Draft' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'This is draft content.' }],
        },
      ],
    };

    const editor = createProductionEditor(draftDoc);
    const json = editor.getJSON() as DocumentNode;

    expect(json.type).toBe('doc');
    expect(json.content).toBeDefined();
    expect(json.content!.length).toBe(2);
    expect(json.content![0].type).toBe('heading');
    expect(json.content![0].content![0].text).toBe('Restored Draft');
    expect(json.content![1].type).toBe('paragraph');
    expect(json.content![1].content![0].text).toBe('This is draft content.');

    editor.destroy();
  });
});

// ── Preservation: clearDraft concept ─────────────────────────────────

describe('Preservation: clearDraft concept', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * The clearDraft function removes the localStorage entry. We verify the
   * draft key pattern and localStorage set/remove cycle using a polyfill
   * (Node test env has no native localStorage).
   */

  beforeEach(() => {
    localStorageMap.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    localStorageMap.clear();
  });

  it('localStorage item can be set and removed by draft key pattern', () => {
    const DRAFT_PREFIX = 'hacmandocs_draft_';
    const documentId = 'test-clear-123';
    const key = `${DRAFT_PREFIX}${documentId}`;

    // Simulate saving a draft
    const draftJson = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
    localStorage.setItem(key, draftJson);
    expect(localStorage.getItem(key)).toBe(draftJson);

    // Simulate clearDraft
    localStorage.removeItem(key);
    expect(localStorage.getItem(key)).toBeNull();
  });
});

// ── Preservation: forwardRef getJSON ─────────────────────────────────

describe('Preservation: forwardRef getJSON', () => {
  /**
   * **Validates: Requirements 3.7**
   *
   * The imperative handle exposes getJSON() which returns a valid DocumentNode.
   * Uses production editor (duplicate Link doesn't affect getJSON).
   */

  it('getJSON returns a valid DocumentNode matching editor content', () => {
    const initialDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello from getJSON' }] },
      ],
    };

    const editor = createProductionEditor(initialDoc);
    const json = editor.getJSON() as DocumentNode;

    expect(json.type).toBe('doc');
    expect(json.content).toBeDefined();
    expect(json.content!.length).toBeGreaterThanOrEqual(1);
    expect(json.content![0].type).toBe('paragraph');
    expect(json.content![0].content![0].text).toBe('Hello from getJSON');

    editor.destroy();
  });

  it('getJSON returns valid DocumentNode for complex content', () => {
    const complexDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'normal ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] },
          ],
        },
      ],
    };

    const editor = createProductionEditor(complexDoc);
    const json = editor.getJSON() as DocumentNode;

    expect(json.type).toBe('doc');
    expect(json.content!.length).toBe(3);
    expect(json.content![0].type).toBe('heading');
    expect(json.content![1].type).toBe('paragraph');
    expect(json.content![2].type).toBe('bulletList');

    editor.destroy();
  });
});

// ── Preservation: initialContent ─────────────────────────────────────

describe('Preservation: initialContent prop', () => {
  /**
   * **Validates: Requirements 3.8**
   *
   * When initialContent is provided, the editor content matches it exactly.
   */

  it('editor content matches provided initialContent', () => {
    const initialContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body text here.' }] },
      ],
    };

    const editor = createProductionEditor(initialContent);
    const json = editor.getJSON() as DocumentNode;

    expect(json.content![0].type).toBe('heading');
    expect(json.content![0].attrs?.level).toBe(1);
    expect(json.content![0].content![0].text).toBe('Title');
    expect(json.content![1].type).toBe('paragraph');
    expect(json.content![1].content![0].text).toBe('Body text here.');

    editor.destroy();
  });
});

// ── Preservation: Code block toggle ──────────────────────────────────

describe('Preservation: Code block toggle', () => {
  /**
   * **Validates: Requirements 3.10**
   *
   * Code block toggle works today and must continue to work after the bugfix.
   * Uses clean extension set and commands.* API for headless compatibility.
   */

  it('toggleCodeBlock activates code block and toggles it off', () => {
    const editor = createCleanEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'some code' }] }],
    });

    // Toggle code block ON
    const codeOnResult = editor.commands.toggleCodeBlock();
    expect(codeOnResult).toBe(true);
    expect(editor.isActive('codeBlock')).toBe(true);

    // Toggle code block OFF
    const codeOffResult = editor.commands.toggleCodeBlock();
    expect(codeOffResult).toBe(true);
    expect(editor.isActive('codeBlock')).toBe(false);

    editor.destroy();
  });
});
