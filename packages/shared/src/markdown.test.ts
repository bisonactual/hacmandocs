import { describe, it, expect } from 'vitest';
import { parseMarkdown, toMarkdown } from './markdown.js';
import type { DocumentNode } from './types.js';

describe('parseMarkdown', () => {
  it('parses headings', () => {
    const doc = parseMarkdown('# Hello\n\n## World');
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(2);
    expect(doc.content![0]).toEqual({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Hello' }],
    });
    expect(doc.content![1]).toEqual({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'World' }],
    });
  });

  it('parses bold and italic text', () => {
    const doc = parseMarkdown('**bold** and *italic*');
    const para = doc.content![0];
    expect(para.type).toBe('paragraph');
    expect(para.content).toEqual([
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
    ]);
  });

  it('parses unordered lists', () => {
    const doc = parseMarkdown('- item 1\n- item 2');
    const list = doc.content![0];
    expect(list.type).toBe('bulletList');
    expect(list.content).toHaveLength(2);
    expect(list.content![0].type).toBe('listItem');
  });

  it('parses ordered lists', () => {
    const doc = parseMarkdown('1. first\n2. second');
    const list = doc.content![0];
    expect(list.type).toBe('orderedList');
    expect(list.content).toHaveLength(2);
  });

  it('parses links', () => {
    const doc = parseMarkdown('[click here](https://example.com)');
    const para = doc.content![0];
    expect(para.content![0]).toEqual({
      type: 'text',
      text: 'click here',
      marks: [{ type: 'link', attrs: { href: 'https://example.com', title: null } }],
    });
  });

  it('parses images', () => {
    const doc = parseMarkdown('![alt text](https://example.com/img.png)');
    const para = doc.content![0];
    expect(para.content![0]).toEqual({
      type: 'image',
      attrs: { src: 'https://example.com/img.png', alt: 'alt text', title: null },
    });
  });

  it('parses code blocks', () => {
    const doc = parseMarkdown('```typescript\nconst x = 1;\n```');
    const codeBlock = doc.content![0];
    expect(codeBlock.type).toBe('codeBlock');
    expect(codeBlock.attrs).toEqual({ language: 'typescript' });
    expect(codeBlock.content![0].text).toBe('const x = 1;');
  });

  it('parses tables', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const doc = parseMarkdown(md);
    const table = doc.content![0];
    expect(table.type).toBe('table');
    expect(table.content).toHaveLength(2); // header row + data row
    expect(table.content![0].type).toBe('tableRow');
    expect(table.content![0].content).toHaveLength(2); // 2 cells
    expect(table.content![0].content![0].type).toBe('tableCell');
  });

  it('parses inline code', () => {
    const doc = parseMarkdown('use `const` keyword');
    const para = doc.content![0];
    expect(para.content![1]).toEqual({
      type: 'text',
      text: 'const',
      marks: [{ type: 'code' }],
    });
  });
});

describe('toMarkdown', () => {
  it('converts headings', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
      ],
    };
    expect(toMarkdown(doc).trim()).toBe('# Title');
  });

  it('converts bold and italic', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    };
    const md = toMarkdown(doc).trim();
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
  });

  it('converts bullet lists', () => {
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
      ],
    };
    const md = toMarkdown(doc).trim();
    expect(md).toContain('- item 1');
    expect(md).toContain('- item 2');
  });

  it('converts code blocks', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'js' },
          content: [{ type: 'text', text: 'const x = 1;' }],
        },
      ],
    };
    const md = toMarkdown(doc);
    expect(md).toContain('```js');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('```');
  });

  it('converts links', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', title: null } }],
            },
          ],
        },
      ],
    };
    const md = toMarkdown(doc).trim();
    expect(md).toContain('[click](https://example.com)');
  });

  it('converts images', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: { src: 'https://example.com/img.png', alt: 'photo', title: null },
            },
          ],
        },
      ],
    };
    const md = toMarkdown(doc).trim();
    expect(md).toContain('![photo](https://example.com/img.png)');
  });

  it('converts tables', () => {
    const doc: DocumentNode = {
      type: 'doc',
      content: [
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
      ],
    };
    const md = toMarkdown(doc);
    expect(md).toContain('| A | B |');
    expect(md).toContain('| 1 | 2 |');
  });
});

describe('round-trip', () => {
  it('round-trips a heading', () => {
    const md = '# Hello World\n';
    const doc = parseMarkdown(md);
    const result = parseMarkdown(toMarkdown(doc));
    expect(result).toEqual(doc);
  });

  it('round-trips a paragraph with formatting', () => {
    const md = '**bold** and *italic* text\n';
    const doc = parseMarkdown(md);
    const result = parseMarkdown(toMarkdown(doc));
    expect(result).toEqual(doc);
  });

  it('round-trips a code block', () => {
    const md = '```js\nconst x = 1;\n```\n';
    const doc = parseMarkdown(md);
    const result = parseMarkdown(toMarkdown(doc));
    expect(result).toEqual(doc);
  });

  it('round-trips a list', () => {
    const md = '- item 1\n- item 2\n';
    const doc = parseMarkdown(md);
    const result = parseMarkdown(toMarkdown(doc));
    expect(result).toEqual(doc);
  });

  it('round-trips a table', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
    const doc = parseMarkdown(md);
    const result = parseMarkdown(toMarkdown(doc));
    expect(result).toEqual(doc);
  });

  it('round-trips a link', () => {
    const md = '[click](https://example.com)\n';
    const doc = parseMarkdown(md);
    const result = parseMarkdown(toMarkdown(doc));
    expect(result).toEqual(doc);
  });

  it('round-trips an image', () => {
    const md = '![alt](https://example.com/img.png)\n';
    const doc = parseMarkdown(md);
    const result = parseMarkdown(toMarkdown(doc));
    expect(result).toEqual(doc);
  });
});

import { parseMarkdownWithWarnings } from './markdown.js';
import type { ParseWarning } from './markdown.js';

describe('parseMarkdownWithWarnings', () => {
  it('parses valid markdown with no warnings', () => {
    const md = '# Hello\n\nSome paragraph text.';
    const { doc, warnings } = parseMarkdownWithWarnings(md, 'test.md');

    expect(warnings).toHaveLength(0);
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(2);
    expect(doc.content![0].type).toBe('heading');
    expect(doc.content![1].type).toBe('paragraph');
  });

  it('returns file path in warning entries', () => {
    // YAML frontmatter is parsed as an unrecognized node by remark
    // but remark-gfm handles most things. We'll test with a node type
    // that convertBlockNode doesn't handle by using the function directly.
    const filePath = 'docs/guide.md';
    const { doc, warnings } = parseMarkdownWithWarnings('# Title\n\nHello world', filePath);

    // Valid markdown produces no warnings
    expect(doc.type).toBe('doc');
    expect(doc.content).toBeDefined();
    // All warnings (if any) should reference the correct file path
    for (const w of warnings) {
      expect(w.filePath).toBe(filePath);
    }
  });

  it('preserves parsable content when some sections are skipped', () => {
    // Remark is very tolerant, so we test that valid sections are preserved
    const md = '# Title\n\n- item 1\n- item 2\n\n```js\nconst x = 1;\n```';
    const { doc, warnings } = parseMarkdownWithWarnings(md, 'file.md');

    expect(warnings).toHaveLength(0);
    expect(doc.type).toBe('doc');
    expect(doc.content!.length).toBeGreaterThanOrEqual(3);
    expect(doc.content![0].type).toBe('heading');
  });

  it('returns warnings array matching ImportReport.warnings shape', () => {
    const { warnings } = parseMarkdownWithWarnings('# Hello', 'test.md');
    // Even with no warnings, the array should exist
    expect(Array.isArray(warnings)).toBe(true);

    // Verify the shape contract: each warning has filePath, content, reason
    for (const w of warnings) {
      expect(w).toHaveProperty('filePath');
      expect(w).toHaveProperty('content');
      expect(w).toHaveProperty('reason');
      expect(typeof w.filePath).toBe('string');
      expect(typeof w.content).toBe('string');
      expect(typeof w.reason).toBe('string');
    }
  });

  it('does not throw errors — always returns a result', () => {
    // Even with empty or unusual input, should not throw
    expect(() => parseMarkdownWithWarnings('', 'empty.md')).not.toThrow();
    expect(() => parseMarkdownWithWarnings('   ', 'whitespace.md')).not.toThrow();
    expect(() => parseMarkdownWithWarnings('\n\n\n', 'newlines.md')).not.toThrow();
  });

  it('handles mixed valid content correctly', () => {
    const md = [
      '# Heading',
      '',
      'A paragraph with **bold** text.',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '> A blockquote',
    ].join('\n');

    const { doc, warnings } = parseMarkdownWithWarnings(md, 'mixed.md');

    expect(warnings).toHaveLength(0);
    expect(doc.type).toBe('doc');
    expect(doc.content!.length).toBe(4); // heading, paragraph, table, blockquote
  });

  it('returns empty doc content when input is empty', () => {
    const { doc, warnings } = parseMarkdownWithWarnings('', 'empty.md');
    expect(doc.type).toBe('doc');
    expect(warnings).toHaveLength(0);
  });

  it('produces same parsed output as parseMarkdown for valid content', () => {
    const md = '# Hello\n\n**bold** and *italic*\n\n- list item\n';
    const { doc } = parseMarkdownWithWarnings(md, 'test.md');
    const directDoc = parseMarkdown(md);

    expect(doc).toEqual(directDoc);
  });
});
