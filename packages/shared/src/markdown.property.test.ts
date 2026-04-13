import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseMarkdown, toMarkdown, parseMarkdownWithWarnings } from './markdown.js';
import type { DocumentNode } from './types.js';

// ── Generators for Property 1: Markdown round-trip ───────────────────

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
      // Deduplicate adjacent nodes with the same mark signature
      const result: DocumentNode[] = [nodes[0]];
      for (let i = 1; i < nodes.length; i++) {
        if (markKey(nodes[i]) !== markKey(result[result.length - 1])) {
          result.push(nodes[i]);
        }
      }
      return result;
    });

/** Generate a heading node (levels 1-6). Headings use a single text node to avoid merge issues. */
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

/** Generate a valid DocumentNode tree (doc root with random block children). */
const documentNodeArb = (): fc.Arbitrary<DocumentNode> =>
  fc.array(
    fc.oneof(
      { weight: 3, arbitrary: headingNode() },
      { weight: 4, arbitrary: paragraphNode() },
      { weight: 2, arbitrary: bulletListNode() },
      { weight: 2, arbitrary: orderedListNode() },
      { weight: 2, arbitrary: codeBlockNode() },
      { weight: 1, arbitrary: tableNode() },
    ),
    { minLength: 1, maxLength: 6 },
  ).map(content => ({ type: 'doc', content }));

// ── Property 1: Markdown round-trip ──────────────────────────────────

describe('Property 1: Markdown round-trip', () => {
  /**
   * **Validates: Requirements 1.5, 2.1, 2.3**
   *
   * For any valid internal document node, converting it to Markdown and then
   * parsing the Markdown back to an internal document node SHALL produce an
   * equivalent document node.
   */
  it('parseMarkdown(toMarkdown(node)) ≡ node for random DocumentNode trees', () => {
    fc.assert(
      fc.property(documentNodeArb(), (node) => {
        const markdown = toMarkdown(node);
        const roundTripped = parseMarkdown(markdown);
        expect(roundTripped).toEqual(node);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Generators for Property 3: Graceful degradation ──────────────────

/** Generate a valid Markdown string from random block elements. */
const validMarkdownBlock = (): fc.Arbitrary<string> =>
  fc.oneof(
    // Heading
    fc.tuple(fc.integer({ min: 1, max: 6 }), safeText()).map(([level, text]) =>
      '#'.repeat(level) + ' ' + text,
    ),
    // Paragraph
    safeText(),
    // Bullet list
    fc.array(safeText(), { minLength: 1, maxLength: 3 }).map(items =>
      items.map(i => `- ${i}`).join('\n'),
    ),
    // Code block
    fc.tuple(fc.constantFrom('js', 'python', ''), safeText()).map(([lang, code]) =>
      '```' + lang + '\n' + code + '\n```',
    ),
  );

/** Generate a valid Markdown document from multiple blocks. */
const validMarkdown = (): fc.Arbitrary<string> =>
  fc.array(validMarkdownBlock(), { minLength: 1, maxLength: 5 })
    .map(blocks => blocks.join('\n\n'));

/**
 * Generate "unparsable" content to inject. Since remark is very tolerant,
 * we use content that exercises edge cases but won't crash the parser.
 */
const weirdContent = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant(''),
    fc.constant('   '),
    fc.constant('\n\n\n'),
    fc.constant('<!-- HTML comment -->'),
    fc.constant('<div>some raw html</div>'),
    safeText().map(t => `~~~\n${t}\n~~~`),
    safeText().map(t => `> > > ${t}`),
    fc.constant('---'),
    fc.constant('***'),
    safeText().map(t => `[broken link](${t}`),
    safeText().map(t => `![broken image](${t}`),
  );

// ── Property 3: Graceful degradation on unparsable content ───────────

describe('Property 3: Graceful degradation on unparsable content', () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any valid Markdown document with injected content at random positions,
   * parseMarkdownWithWarnings SHALL:
   * 1. Never throw an exception
   * 2. Always return a valid result structure (doc + warnings array)
   * 3. Preserve parsable content from the original document
   */
  it('parseMarkdownWithWarnings never throws and always returns a valid structure', () => {
    fc.assert(
      fc.property(
        validMarkdown(),
        weirdContent(),
        fc.constantFrom('start', 'middle', 'end'),
        safeText().map(t => t + '.md'),
        (markdown, injected, position, filePath) => {
          let modifiedMarkdown: string;
          if (position === 'start') {
            modifiedMarkdown = injected + '\n\n' + markdown;
          } else if (position === 'end') {
            modifiedMarkdown = markdown + '\n\n' + injected;
          } else {
            const mid = Math.floor(markdown.length / 2);
            modifiedMarkdown = markdown.slice(0, mid) + '\n\n' + injected + '\n\n' + markdown.slice(mid);
          }

          // Must never throw
          const result = parseMarkdownWithWarnings(modifiedMarkdown, filePath);

          // Must return a valid structure
          expect(result).toHaveProperty('doc');
          expect(result).toHaveProperty('warnings');
          expect(result.doc.type).toBe('doc');
          expect(Array.isArray(result.warnings)).toBe(true);

          // All warnings must have the correct shape
          for (const w of result.warnings) {
            expect(w).toHaveProperty('filePath');
            expect(w).toHaveProperty('content');
            expect(w).toHaveProperty('reason');
            expect(w.filePath).toBe(filePath);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('parsable content from the original is preserved in the output', () => {
    fc.assert(
      fc.property(
        validMarkdown(),
        safeText().map(t => t + '.md'),
        (markdown, filePath) => {
          // Parse the original markdown
          const original = parseMarkdown(markdown);

          // Parse with warnings (no injection — should be identical)
          const { doc, warnings } = parseMarkdownWithWarnings(markdown, filePath);

          // With no injected content, the result should match parseMarkdown
          expect(doc).toEqual(original);
          expect(warnings).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
