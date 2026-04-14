import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseMarkdown, toMarkdown } from './markdown.js';
import type { DocumentNode } from './types.js';

// ── Generators ───────────────────────────────────────────────────────

/**
 * Generate a non-empty alphanumeric string safe for Markdown round-tripping.
 * Avoids characters that have special meaning in Markdown (*, _, `, [, ], etc.)
 * and avoids leading/trailing whitespace which gets normalized.
 */
const safeText = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9 ]{0,28}[a-zA-Z0-9]$/)
    .filter(s => s.length >= 1);

/** Generate a plain text node (no marks). */
const textNode = (): fc.Arbitrary<DocumentNode> =>
  safeText().map(text => ({ type: 'text', text }));

/** Generate a text node with bold mark. */
const boldTextNode = (): fc.Arbitrary<DocumentNode> =>
  safeText().map(text => ({ type: 'text', text, marks: [{ type: 'bold' }] }));

/** Generate a text node with italic mark. */
const italicTextNode = (): fc.Arbitrary<DocumentNode> =>
  safeText().map(text => ({ type: 'text', text, marks: [{ type: 'italic' }] }));

/** Generate a text node with code mark. */
const codeTextNode = (): fc.Arbitrary<DocumentNode> =>
  safeText().map(text => ({ type: 'text', text, marks: [{ type: 'code' }] }));

/**
 * Compute a string key for a node's mark signature so we can detect adjacency.
 * Adjacent nodes with the same marks get merged during Markdown round-trip,
 * so the generator must avoid producing them.
 */
function markKey(node: DocumentNode): string {
  if (!node.marks || node.marks.length === 0) return 'plain';
  return node.marks.map(m => m.type).sort().join('+');
}

/** Generate inline content ensuring no two adjacent nodes share the same marks. */
const inlineContent = (): fc.Arbitrary<DocumentNode[]> =>
  fc.array(fc.oneof(textNode(), boldTextNode(), italicTextNode(), codeTextNode()), { minLength: 1, maxLength: 4 })
    .map(nodes => {
      const result: DocumentNode[] = [nodes[0]];
      for (let i = 1; i < nodes.length; i++) {
        if (markKey(nodes[i]) !== markKey(result[result.length - 1])) {
          result.push(nodes[i]);
        }
      }
      return result;
    });

/** Generate a heading node (levels 1-6). */
const headingNode = (): fc.Arbitrary<DocumentNode> =>
  fc.tuple(fc.integer({ min: 1, max: 6 }), textNode())
    .map(([level, text]) => ({
      type: 'heading',
      attrs: { level },
      content: [text],
    }));

/** Generate a paragraph node with inline content. */
const paragraphNode = (): fc.Arbitrary<DocumentNode> =>
  inlineContent().map(content => ({ type: 'paragraph', content }));

/** Generate a code block node. */
const codeBlockNode = (): fc.Arbitrary<DocumentNode> =>
  fc.tuple(
    fc.constantFrom(null, 'js', 'typescript', 'python', 'rust', 'html', 'css'),
    safeText(),
  ).map(([language, code]) => ({
    type: 'codeBlock',
    attrs: { language },
    content: [{ type: 'text', text: code }],
  }));

/** Generate a bullet list node. */
const bulletListNode = (): fc.Arbitrary<DocumentNode> =>
  fc.array(
    textNode().map(text => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [text] }],
    })),
    { minLength: 1, maxLength: 4 },
  ).map(items => ({ type: 'bulletList', content: items }));

/** Generate an ordered list node. */
const orderedListNode = (): fc.Arbitrary<DocumentNode> =>
  fc.array(
    textNode().map(text => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [text] }],
    })),
    { minLength: 1, maxLength: 4 },
  ).map(items => ({ type: 'orderedList', content: items }));

/** Generate a blockquote node. */
const blockquoteNode = (): fc.Arbitrary<DocumentNode> =>
  fc.array(
    textNode().map(text => ({
      type: 'paragraph',
      content: [text],
    })),
    { minLength: 1, maxLength: 2 },
  ).map(content => ({ type: 'blockquote', content }));

/** Generate a table cell. */
const tableCell = (): fc.Arbitrary<DocumentNode> =>
  textNode().map(text => ({
    type: 'tableCell',
    content: [{ type: 'paragraph', content: [text] }],
  }));

/** Generate a table node with consistent column count. */
const tableNode = (): fc.Arbitrary<DocumentNode> =>
  fc.tuple(
    fc.integer({ min: 1, max: 4 }),  // columns
    fc.integer({ min: 2, max: 4 }),  // rows (min 2: header + at least 1 data row)
  ).chain(([cols, rows]) =>
    fc.array(
      fc.array(tableCell(), { minLength: cols, maxLength: cols }),
      { minLength: rows, maxLength: rows },
    ).map(rowCells => ({
      type: 'table',
      content: rowCells.map(cells => ({ type: 'tableRow', content: cells })),
    })),
  );

/** Generate a horizontal rule node. */
const horizontalRuleNode = (): fc.Arbitrary<DocumentNode> =>
  fc.constant({ type: 'horizontalRule' } as DocumentNode);

/** Generate a valid DocumentNode tree (doc root with random block children). */
const documentNodeArb = (): fc.Arbitrary<DocumentNode> =>
  fc.array(
    fc.oneof(
      { weight: 3, arbitrary: headingNode() },
      { weight: 4, arbitrary: paragraphNode() },
      { weight: 2, arbitrary: bulletListNode() },
      { weight: 2, arbitrary: orderedListNode() },
      { weight: 2, arbitrary: codeBlockNode() },
      { weight: 1, arbitrary: blockquoteNode() },
      { weight: 1, arbitrary: tableNode() },
      { weight: 1, arbitrary: horizontalRuleNode() },
    ),
    { minLength: 1, maxLength: 6 },
  ).map(content => ({ type: 'doc', content }));

// ── Preservation Property: toMarkdown does not throw ─────────────────

describe('Preservation Property: toMarkdown does not throw for supported types', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.10**
   *
   * For any schema-valid DocumentNode tree using only supported node types,
   * toMarkdown(doc) SHALL NOT throw an exception. This preserves the existing
   * contract that the markdown converter handles all supported types.
   */
  it('toMarkdown(doc) never throws for schema-valid DocumentNode trees', () => {
    fc.assert(
      fc.property(documentNodeArb(), (doc) => {
        expect(() => toMarkdown(doc)).not.toThrow();
        const md = toMarkdown(doc);
        expect(typeof md).toBe('string');
        expect(md.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Preservation Property: Round-trip preserves structure ────────────

describe('Preservation Property: parseMarkdown(toMarkdown(doc)) round-trip', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.10**
   *
   * For any schema-valid DocumentNode tree using only supported node types,
   * parseMarkdown(toMarkdown(doc)) SHALL produce an equivalent DocumentNode.
   * This preserves the existing round-trip fidelity of the markdown converter.
   */
  it('parseMarkdown(toMarkdown(doc)) ≡ doc for schema-valid DocumentNode trees', () => {
    fc.assert(
      fc.property(documentNodeArb(), (doc) => {
        const markdown = toMarkdown(doc);
        const roundTripped = parseMarkdown(markdown);
        expect(roundTripped).toEqual(doc);
      }),
      { numRuns: 100 },
    );
  });
});
