import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import type { Root, RootContent, PhrasingContent, TableRow, TableCell, ListItem, BlockContent, DefinitionContent } from 'mdast';
import type { DocumentNode, ImportReport, MarkdownConverter } from './types.js';

/** Warning entry for unparsable content during markdown parsing. */
export type ParseWarning = ImportReport['warnings'][number];

// ── Admonition pre-processing ─────────────────────────────────────────

/**
 * Pre-process Markdown to convert MkDocs-style admonitions into a custom
 * format that survives remark parsing. We convert them to blockquotes with
 * a special marker that we detect during ProseMirror conversion.
 *
 * Input:  !!! tip "Fix It?"
 *             Some content here
 *
 * Output: A DocumentNode with type 'admonition' and attrs { admonitionType, title }
 */
const ADMONITION_RE = /^!!! (\w+)(?: "([^"]*)")?$/;

function preprocessAdmonitions(markdown: string): { processed: string; admonitions: Map<number, { type: string; title: string }> } {
  const lines = markdown.split('\n');
  const admonitions = new Map<number, { type: string; title: string }>();
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = lines[i].match(ADMONITION_RE);
    if (match) {
      const adType = match[1];
      const adTitle = match[2] ?? match[1].charAt(0).toUpperCase() + match[1].slice(1);

      // Collect indented body lines
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length && (lines[i].startsWith('    ') || lines[i].trim() === '')) {
        if (lines[i].trim() === '' && i + 1 < lines.length && !lines[i + 1].startsWith('    ')) {
          break;
        }
        bodyLines.push(lines[i].startsWith('    ') ? lines[i].slice(4) : lines[i]);
        i++;
      }

      // Use a blockquote with a special first line as marker
      const marker = `**[ADMONITION:${adType}:${adTitle}]**`;
      output.push(`> ${marker}`);
      output.push('>');
      for (const line of bodyLines) {
        output.push(`> ${line}`);
      }
      output.push('');
    } else {
      output.push(lines[i]);
      i++;
    }
  }

  return { processed: output.join('\n'), admonitions };
}


// ── MDAST → ProseMirror JSON ─────────────────────────────────────────

function mdastToProseMirror(node: Root): DocumentNode {
  const content = convertChildren(node.children);
  return { type: 'doc', content: content.length > 0 ? content : undefined };
}

function convertChildren(nodes: RootContent[]): DocumentNode[] {
  const result: DocumentNode[] = [];
  for (const node of nodes) {
    const converted = convertBlockNode(node);
    if (converted) result.push(converted);
  }
  return result;
}

function convertBlockNode(node: RootContent): DocumentNode | null {
  switch (node.type) {
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: node.depth },
        content: convertInlineNodes(node.children),
      };

    case 'paragraph':
      return {
        type: 'paragraph',
        content: convertInlineNodes(node.children),
      };

    case 'blockquote': {
      // Check if this is an admonition (converted from !!! syntax)
      const children = node.children as RootContent[];
      if (children.length > 0 && children[0].type === 'paragraph') {
        const firstPara = children[0];
        if (firstPara.children?.length > 0) {
          const firstChild = firstPara.children[0];
          if (firstChild.type === 'strong' && firstChild.children?.length > 0) {
            const strongText = firstChild.children[0];
            if (strongText.type === 'text') {
              const markerMatch = strongText.value.match(/^\[ADMONITION:(\w+):([^\]]*)\]$/);
              if (markerMatch) {
                // This is an admonition — convert to custom node
                const remainingChildren = children.slice(1);
                // Also skip empty paragraphs right after the marker
                const bodyNodes = remainingChildren.filter(c => {
                  if (c.type === 'paragraph' && c.children?.length === 1) {
                    const child = c.children[0];
                    if (child.type === 'text' && child.value.trim() === '') return false;
                  }
                  return true;
                });
                return {
                  type: 'admonition',
                  attrs: {
                    admonitionType: markerMatch[1],
                    title: markerMatch[2],
                  },
                  content: convertChildren(bodyNodes),
                };
              }
            }
          }
        }
      }
      return {
        type: 'blockquote',
        content: convertChildren(children),
      };
    }

    case 'code':
      return {
        type: 'codeBlock',
        attrs: { language: node.lang ?? null },
        content: [{ type: 'text', text: node.value }],
      };

    case 'list':
      return {
        type: node.ordered ? 'orderedList' : 'bulletList',
        content: node.children.map(convertListItem),
      };

    case 'thematicBreak':
      return { type: 'horizontalRule' };

    case 'table':
      return {
        type: 'table',
        content: node.children.map(convertTableRow),
      };

    case 'html': {
      // Detect <video> tags and convert to video node
      const videoMatch = node.value.match(/^<video\s[^>]*src="([^"]*)"[^>]*>/);
      if (videoMatch) {
        return {
          type: 'video',
          attrs: { src: videoMatch[1] },
        };
      }
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: node.value }],
      };
    }

    default:
      return null;
  }
}

function convertListItem(item: ListItem): DocumentNode {
  const content: DocumentNode[] = [];
  for (const child of item.children) {
    if (child.type === 'paragraph') {
      content.push({
        type: 'paragraph',
        content: convertInlineNodes(child.children),
      });
    } else if (child.type === 'list') {
      content.push(convertBlockNode(child) as DocumentNode);
    } else {
      const converted = convertBlockNode(child as RootContent);
      if (converted) content.push(converted);
    }
  }
  return { type: 'listItem', content };
}

function convertTableRow(row: TableRow): DocumentNode {
  return {
    type: 'tableRow',
    content: row.children.map(convertTableCell),
  };
}

function convertTableCell(cell: TableCell): DocumentNode {
  return {
    type: 'tableCell',
    content: [
      {
        type: 'paragraph',
        content: convertInlineNodes(cell.children),
      },
    ],
  };
}

function convertInlineNodes(nodes: PhrasingContent[]): DocumentNode[] {
  const result: DocumentNode[] = [];
  for (const node of nodes) {
    result.push(...convertInlineNode(node));
  }
  return result.length > 0 ? result : [{ type: 'text', text: '' }];
}

function convertInlineNode(node: PhrasingContent, marks?: DocumentNode['marks']): DocumentNode[] {
  switch (node.type) {
    case 'text':
      return [{ type: 'text', text: node.value, marks: marks?.length ? marks : undefined }];

    case 'strong': {
      const newMarks = [...(marks ?? []), { type: 'bold' }];
      return node.children.flatMap(child => convertInlineNode(child, newMarks));
    }

    case 'emphasis': {
      const newMarks = [...(marks ?? []), { type: 'italic' }];
      return node.children.flatMap(child => convertInlineNode(child, newMarks));
    }

    case 'inlineCode':
      return [{ type: 'text', text: node.value, marks: [{ type: 'code' }, ...(marks ?? [])] }];

    case 'link':
      return node.children.flatMap(child =>
        convertInlineNode(child, [
          ...(marks ?? []),
          { type: 'link', attrs: { href: node.url, title: node.title ?? null } },
        ]),
      );

    case 'image':
      return [
        {
          type: 'image',
          attrs: { src: node.url, alt: node.alt ?? null, title: node.title ?? null },
        },
      ];

    case 'break':
      return [{ type: 'hardBreak' }];

    case 'delete': {
      const newMarks = [...(marks ?? []), { type: 'strike' }];
      return node.children.flatMap(child => convertInlineNode(child, newMarks));
    }

    default:
      // For any unrecognized inline node, try to extract text
      if ('value' in node && typeof node.value === 'string') {
        return [{ type: 'text', text: node.value, marks: marks?.length ? marks : undefined }];
      }
      if ('children' in node && Array.isArray(node.children)) {
        return (node.children as PhrasingContent[]).flatMap(child => convertInlineNode(child, marks));
      }
      return [];
  }
}

// ── ProseMirror JSON → MDAST ─────────────────────────────────────────

function proseMirrorToMdast(doc: DocumentNode): Root {
  return {
    type: 'root',
    children: (doc.content ?? []).map(pmNodeToMdast).filter(Boolean) as RootContent[],
  };
}

function pmNodeToMdast(node: DocumentNode): RootContent | null {
  switch (node.type) {
    case 'heading': {
      const depth = (node.attrs?.level as number) ?? 1;
      return {
        type: 'heading',
        depth: Math.min(Math.max(depth, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6,
        children: pmInlineToMdast(node.content ?? []),
      };
    }

    case 'paragraph':
      return {
        type: 'paragraph',
        children: pmInlineToMdast(node.content ?? []),
      };

    case 'blockquote':
      return {
        type: 'blockquote',
        children: (node.content ?? []).map(pmNodeToMdast).filter(Boolean) as (BlockContent | DefinitionContent)[],
      };

    case 'codeBlock': {
      const text = (node.content ?? []).map(c => c.text ?? '').join('');
      return {
        type: 'code',
        lang: (node.attrs?.language as string) ?? undefined,
        value: text,
      };
    }

    case 'bulletList':
      return {
        type: 'list',
        ordered: false,
        children: (node.content ?? []).map(pmListItemToMdast),
      };

    case 'orderedList':
      return {
        type: 'list',
        ordered: true,
        children: (node.content ?? []).map(pmListItemToMdast),
      };

    case 'horizontalRule':
      return { type: 'thematicBreak' };

    case 'video':
      return {
        type: 'html',
        value: `<video src="${(node.attrs?.src as string) ?? ''}" controls></video>`,
      };

    case 'table':
      return {
        type: 'table',
        children: (node.content ?? []).map(pmTableRowToMdast),
      };

    default:
      return null;
  }
}

function pmListItemToMdast(node: DocumentNode): ListItem {
  const children = (node.content ?? []).map(child => {
    if (child.type === 'bulletList' || child.type === 'orderedList') {
      return pmNodeToMdast(child) as RootContent;
    }
    return pmNodeToMdast(child) as RootContent;
  }).filter(Boolean) as ListItem['children'];

  return { type: 'listItem', children };
}

function pmTableRowToMdast(node: DocumentNode): TableRow {
  return {
    type: 'tableRow',
    children: (node.content ?? []).map(pmTableCellToMdast),
  };
}

function pmTableCellToMdast(node: DocumentNode): TableCell {
  // Table cells contain paragraphs; extract inline content from the first paragraph
  const para = node.content?.[0];
  const children = para?.content ? pmInlineToMdast(para.content) : [];
  return {
    type: 'tableCell',
    children,
  };
}

function pmInlineToMdast(nodes: DocumentNode[]): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  for (const node of nodes) {
    const converted = pmInlineNodeToMdast(node);
    if (converted) result.push(converted);
  }
  return result;
}

function pmInlineNodeToMdast(node: DocumentNode): PhrasingContent | null {
  if (node.type === 'image') {
    return {
      type: 'image',
      url: (node.attrs?.src as string) ?? '',
      alt: (node.attrs?.alt as string) ?? undefined,
      title: (node.attrs?.title as string) ?? undefined,
    };
  }

  if (node.type === 'hardBreak') {
    return { type: 'break' };
  }

  if (node.type === 'text') {
    const text = node.text ?? '';
    if (!node.marks || node.marks.length === 0) {
      return { type: 'text', value: text };
    }
    return wrapWithMarks(text, node.marks);
  }

  return null;
}

function wrapWithMarks(
  text: string,
  marks: NonNullable<DocumentNode['marks']>,
): PhrasingContent {
  // Sort marks to ensure consistent nesting order: link > bold > italic > code > strike
  const sorted = [...marks].sort((a, b) => {
    const order: Record<string, number> = { link: 0, bold: 1, italic: 2, code: 3, strike: 4 };
    return (order[a.type] ?? 99) - (order[b.type] ?? 99);
  });

  let current: PhrasingContent = { type: 'text', value: text };

  // Apply marks from innermost to outermost (reverse order)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const mark = sorted[i];
    switch (mark.type) {
      case 'bold':
        current = { type: 'strong', children: [current] };
        break;
      case 'italic':
        current = { type: 'emphasis', children: [current] };
        break;
      case 'code':
        // Inline code is a leaf node, extract text value
        if (current.type === 'text') {
          current = { type: 'inlineCode', value: current.value };
        } else {
          current = { type: 'inlineCode', value: text };
        }
        break;
      case 'link':
        current = {
          type: 'link',
          url: (mark.attrs?.href as string) ?? '',
          title: (mark.attrs?.title as string) ?? undefined,
          children: [current],
        };
        break;
      case 'strike':
        current = { type: 'delete', children: [current] };
        break;
    }
  }

  return current;
}

// ── Warning-aware conversion ─────────────────────────────────────────

function mdastToProseMirrorWithWarnings(
  node: Root,
  filePath: string,
  markdown: string,
): { doc: DocumentNode; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];
  const content: DocumentNode[] = [];

  for (const child of node.children) {
    try {
      const converted = convertBlockNode(child);
      if (converted) {
        content.push(converted);
      } else {
        // Node type not recognized — extract raw content from source positions
        const raw = extractRawContent(child, markdown);
        warnings.push({
          filePath,
          content: raw,
          reason: `Unsupported Markdown node type: ${child.type}`,
        });
      }
    } catch (err) {
      const raw = extractRawContent(child, markdown);
      const reason = err instanceof Error ? err.message : 'Unknown parse error';
      warnings.push({ filePath, content: raw, reason });
    }
  }

  return {
    doc: { type: 'doc', content: content.length > 0 ? content : undefined },
    warnings,
  };
}

/**
 * Extract the raw markdown text for an MDAST node using its source position.
 * Falls back to a string representation if position info is unavailable.
 */
function extractRawContent(node: RootContent, markdown: string): string {
  if (node.position) {
    const start = node.position.start.offset;
    const end = node.position.end.offset;
    if (start !== undefined && end !== undefined) {
      return markdown.slice(start, end);
    }
  }
  // Fallback: try to stringify the node or use its type
  if ('value' in node && typeof node.value === 'string') {
    return node.value;
  }
  return `[${node.type}]`;
}

// ── Public API ───────────────────────────────────────────────────────

const parser = unified().use(remarkParse).use(remarkGfm);
const serializer = unified().use(remarkStringify, {
  bullet: '-',
  emphasis: '*',
  strong: '*',
  rule: '-',
}).use(remarkGfm);

/**
 * Parse a Markdown string into a ProseMirror-compatible DocumentNode.
 */
export function parseMarkdown(markdown: string): DocumentNode {
  const { processed } = preprocessAdmonitions(markdown);
  const tree = parser.parse(processed);
  return mdastToProseMirror(tree);
}

/**
 * Parse a Markdown string with graceful degradation for unparsable content.
 *
 * Unlike `parseMarkdown`, this function does not throw on unparsable sections.
 * Instead, it logs them to a warnings array and continues parsing the rest.
 *
 * @param markdown - The Markdown source text
 * @param filePath - The file path (used in warning entries)
 * @returns The parsed DocumentNode and an array of warnings for skipped content
 */
export function parseMarkdownWithWarnings(
  markdown: string,
  filePath: string,
): { doc: DocumentNode; warnings: ParseWarning[] } {
  try {
    const { processed } = preprocessAdmonitions(markdown);
    const tree = parser.parse(processed);
    return mdastToProseMirrorWithWarnings(tree, filePath, processed);
  } catch (err) {
    // If the entire parse fails, return an empty doc with a warning
    const reason = err instanceof Error ? err.message : 'Unknown parse error';
    return {
      doc: { type: 'doc' },
      warnings: [{ filePath, content: markdown, reason }],
    };
  }
}

/**
 * Convert a ProseMirror-compatible DocumentNode back to a Markdown string.
 */
export function toMarkdown(doc: DocumentNode): string {
  const mdast = proseMirrorToMdast(doc);
  return serializer.stringify(mdast);
}

/**
 * A MarkdownConverter implementation using unified/remark.
 */
export const markdownConverter: MarkdownConverter = {
  parseMarkdown,
  toMarkdown,
};
