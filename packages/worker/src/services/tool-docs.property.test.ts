import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { DocumentNode } from '@hacmandocs/shared';
import {
  buildToolDocsContent,
  validateLockedEdit,
  removeSystemNodes,
} from './tool-docs.js';

// ── Shared generators ────────────────────────────────────────────────

/** Random non-empty string for tool names / IDs */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 });

/** Random quiz description: either a non-empty string or null */
const quizDescriptionArb = fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null });

/** A random user-authored paragraph node */
const userParagraphNodeArb: fc.Arbitrary<DocumentNode> = fc.record({
  type: fc.constant('paragraph'),
  content: fc.constant([{ type: 'text', text: '' }]).chain((_defaultContent) =>
    fc.string({ minLength: 0, maxLength: 100 }).map((text) => [{ type: 'text' as const, text }]),
  ),
});

/** Generate a random array of user-authored paragraph nodes (1–5 nodes) */
const userNodesArb = fc.array(userParagraphNodeArb, { minLength: 1, maxLength: 5 });

/**
 * Build a random linked page content with user-authored nodes appended.
 * Returns the full doc node with trainingLink at [0], details at [1],
 * and user nodes at [2..].
 */
function buildPageWithUserContent(
  toolId: string,
  toolName: string,
  quizDescription: string | null,
  userNodes: DocumentNode[],
): DocumentNode {
  const base = buildToolDocsContent(toolId, toolName, quizDescription);
  return {
    ...base,
    content: [
      base.content![0], // trainingLink
      base.content![1], // details
      ...userNodes,
    ],
  };
}


// =====================================================================
// Property 8: Locked page rejects system-managed field edits
// =====================================================================

describe('Property 8: Locked page rejects system-managed field edits', () => {
  /**
   * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.6, 13.2**
   *
   * For any linked page content, any proposed edit that modifies the
   * trainingLink node (index 0) or the descriptionSection node (index 1)
   * SHALL be rejected by validateLockedEdit (returns a non-null error message).
   */

  it('rejects edits that modify the trainingLink toolId', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        nonEmptyStringArb,
        (toolId, toolName, quizDesc, userNodes, newToolId) => {
          fc.pre(newToolId !== toolId);

          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);
          const proposed: DocumentNode = {
            ...existing,
            content: [
              {
                ...existing.content![0],
                attrs: { ...existing.content![0].attrs, toolId: newToolId },
              },
              existing.content![1],
              ...existing.content!.slice(2),
            ],
          };

          const result = validateLockedEdit(existing, proposed);
          expect(result).not.toBeNull();
          expect(typeof result).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects edits that modify the trainingLink toolName', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        nonEmptyStringArb,
        (toolId, toolName, quizDesc, userNodes, newToolName) => {
          fc.pre(newToolName !== toolName);

          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);
          const proposed: DocumentNode = {
            ...existing,
            content: [
              {
                ...existing.content![0],
                attrs: { ...existing.content![0].attrs, toolName: newToolName },
              },
              existing.content![1],
              ...existing.content!.slice(2),
            ],
          };

          const result = validateLockedEdit(existing, proposed);
          expect(result).not.toBeNull();
          expect(typeof result).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects edits that modify the descriptionSection content', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        nonEmptyStringArb,
        (toolId, toolName, quizDesc, userNodes, extraText) => {
          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);
          const existingDetails = existing.content![1];

          // Modify the details node by adding an extra paragraph to its content
          const modifiedDetails: DocumentNode = {
            ...existingDetails,
            content: [
              ...(existingDetails.content ?? []),
              { type: 'paragraph', content: [{ type: 'text', text: extraText }] },
            ],
          };

          const proposed: DocumentNode = {
            ...existing,
            content: [
              existing.content![0],
              modifiedDetails,
              ...existing.content!.slice(2),
            ],
          };

          const result = validateLockedEdit(existing, proposed);
          expect(result).not.toBeNull();
          expect(typeof result).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects edits that change the details summary text', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        nonEmptyStringArb,
        (toolId, toolName, quizDesc, userNodes, newSummary) => {
          fc.pre(newSummary !== 'About this tool');

          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);
          const existingDetails = existing.content![1];

          // Replace the detailsSummary text
          const modifiedDetails: DocumentNode = {
            ...existingDetails,
            content: [
              {
                type: 'detailsSummary',
                content: [{ type: 'text', text: newSummary }],
              },
              ...(existingDetails.content ?? []).slice(1),
            ],
          };

          const proposed: DocumentNode = {
            ...existing,
            content: [
              existing.content![0],
              modifiedDetails,
              ...existing.content!.slice(2),
            ],
          };

          const result = validateLockedEdit(existing, proposed);
          expect(result).not.toBeNull();
          expect(typeof result).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });
});


// =====================================================================
// Property 9: Locked page allows user content edits
// =====================================================================

describe('Property 9: Locked page allows user content edits', () => {
  /**
   * **Validates: Requirements 10.5**
   *
   * For any linked page content, any proposed edit that only modifies,
   * adds, or removes nodes at index >= 2 while keeping index 0 and 1
   * identical SHALL be accepted by validateLockedEdit (returns null).
   */

  it('allows adding new user nodes below system-managed content', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        userNodesArb,
        (toolId, toolName, quizDesc, userNodes, extraNodes) => {
          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);

          // Deep copy index 0 and 1 to ensure identity, then append extra nodes
          const proposed: DocumentNode = {
            ...existing,
            content: [
              JSON.parse(JSON.stringify(existing.content![0])),
              JSON.parse(JSON.stringify(existing.content![1])),
              ...existing.content!.slice(2),
              ...extraNodes,
            ],
          };

          const result = validateLockedEdit(existing, proposed);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('allows removing user nodes below system-managed content', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        (toolId, toolName, quizDesc, userNodes) => {
          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);

          // Keep only system nodes, remove all user content
          const proposed: DocumentNode = {
            ...existing,
            content: [
              JSON.parse(JSON.stringify(existing.content![0])),
              JSON.parse(JSON.stringify(existing.content![1])),
            ],
          };

          const result = validateLockedEdit(existing, proposed);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('allows modifying existing user nodes below system-managed content', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        (toolId, toolName, quizDesc, userNodes, modifiedText) => {
          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);

          // Replace all user nodes with a single modified paragraph
          const proposed: DocumentNode = {
            ...existing,
            content: [
              JSON.parse(JSON.stringify(existing.content![0])),
              JSON.parse(JSON.stringify(existing.content![1])),
              { type: 'paragraph', content: [{ type: 'text', text: modifiedText }] },
            ],
          };

          const result = validateLockedEdit(existing, proposed);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('allows keeping content completely identical (no-op edit)', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        (toolId, toolName, quizDesc, userNodes) => {
          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);

          // Deep-copy the entire content to simulate an identical edit
          const proposed: DocumentNode = JSON.parse(JSON.stringify(existing));

          const result = validateLockedEdit(existing, proposed);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});


// =====================================================================
// Property 10: Release removes system nodes and preserves page
// =====================================================================

describe('Property 10: Release removes system nodes and preserves page', () => {
  /**
   * **Validates: Requirements 11.4, 12.1, 12.3, 12.4**
   *
   * For any page content with trainingLink + details + random user-authored
   * paragraph nodes, calling removeSystemNodes SHALL:
   * - Remove the trainingLink node (no node with type 'trainingLink')
   * - Remove the `data-system-managed` attr from the details node
   * - Preserve all user-authored content nodes in their original order
   */

  it('trainingLink is absent after removeSystemNodes', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        (toolId, toolName, quizDesc, userNodes) => {
          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);
          const result = removeSystemNodes(existing);

          const hasTrainingLink = (result.content ?? []).some(
            (node) => node.type === 'trainingLink',
          );
          expect(hasTrainingLink).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('data-system-managed attr is removed from details node', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        (toolId, toolName, quizDesc, userNodes) => {
          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);
          const result = removeSystemNodes(existing);

          const detailsNode = (result.content ?? []).find(
            (node) => node.type === 'details',
          );
          expect(detailsNode).toBeDefined();

          const attrs = detailsNode!.attrs ?? {};
          expect(attrs).not.toHaveProperty('data-system-managed');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all user-authored content nodes are preserved in original order', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        (toolId, toolName, quizDesc, userNodes) => {
          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);
          const result = removeSystemNodes(existing);

          // After removal: [details (cleaned), ...userNodes]
          // The details node is at index 0, user nodes start at index 1
          const resultNodes = result.content ?? [];
          const resultUserNodes = resultNodes.slice(1);

          expect(resultUserNodes.length).toBe(userNodes.length);

          for (let i = 0; i < userNodes.length; i++) {
            expect(JSON.stringify(resultUserNodes[i])).toBe(
              JSON.stringify(userNodes[i]),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('result has fewer nodes than the original (trainingLink removed)', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        nonEmptyStringArb,
        quizDescriptionArb,
        userNodesArb,
        (toolId, toolName, quizDesc, userNodes) => {
          const existing = buildPageWithUserContent(toolId, toolName, quizDesc, userNodes);
          const result = removeSystemNodes(existing);

          // Original: trainingLink + details + userNodes
          // Result: details (cleaned) + userNodes
          expect((result.content ?? []).length).toBe(
            (existing.content ?? []).length - 1,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Disambiguation helper (pure logic extracted from findUnlinkedPageByTitle) ─

/**
 * Pure disambiguation logic: given a set of candidate pages and a set of
 * already-linked IDs, filter out linked pages and return the unlinked page
 * with the most recent updatedAt, or null if all are linked.
 */
function disambiguate(
  pages: { id: string; updatedAt: number }[],
  linkedIds: Set<string>,
): { id: string; updatedAt: number } | null {
  const unlinked = pages.filter((p) => !linkedIds.has(p.id));
  if (unlinked.length === 0) return null;
  return unlinked.reduce((best, p) => (p.updatedAt > best.updatedAt ? p : best));
}

// =====================================================================
// Property 7: Disambiguation selects correct unlinked page
// =====================================================================

describe('Property 7: Disambiguation selects correct unlinked page', () => {
  /**
   * **Validates: Requirements 8.4, 8.5, 12.5, 12.6**
   *
   * For any set of candidate pages with varying updatedAt timestamps,
   * and any subset of those page IDs marked as "linked", the disambiguation
   * logic SHALL:
   * - Return null if all pages are linked
   * - Return the unlinked page with the most recent updatedAt otherwise
   * - Never return a page whose ID is in the linked set
   * - Always return the sole unlinked page when exactly one exists
   */

  /** Generator for a page object with unique ID and random timestamp */
  const pageArb = fc.record({
    id: fc.uuid(),
    updatedAt: fc.integer({ min: 0, max: 2_000_000_000 }),
  });

  /** Generator for a non-empty array of pages (1–20) */
  const pagesArb = fc.array(pageArb, { minLength: 1, maxLength: 20 });

  it('returns null when all pages are linked', () => {
    fc.assert(
      fc.property(pagesArb, (pages) => {
        // Make every page ID linked
        const linkedIds = new Set(pages.map((p) => p.id));
        const result = disambiguate(pages, linkedIds);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('returns the unlinked page with the most recent updatedAt', () => {
    fc.assert(
      fc.property(
        pagesArb,
        fc.integer({ min: 0, max: 100 }),
        (pages, seed) => {
          // Deduplicate by ID to avoid ambiguity
          const uniquePages = [...new Map(pages.map((p) => [p.id, p])).values()];
          fc.pre(uniquePages.length >= 2);

          // Link a random subset (but not all)
          const linkedCount = Math.max(1, Math.min(uniquePages.length - 1, (seed % uniquePages.length)));
          const linkedIds = new Set(uniquePages.slice(0, linkedCount).map((p) => p.id));

          // Ensure at least one is unlinked
          const unlinked = uniquePages.filter((p) => !linkedIds.has(p.id));
          fc.pre(unlinked.length > 0);

          const result = disambiguate(uniquePages, linkedIds);
          expect(result).not.toBeNull();

          // Result should be the unlinked page with max updatedAt
          const expectedMaxUpdatedAt = Math.max(...unlinked.map((p) => p.updatedAt));
          expect(result!.updatedAt).toBe(expectedMaxUpdatedAt);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('never returns a page in the linked set', () => {
    fc.assert(
      fc.property(
        pagesArb,
        fc.integer({ min: 0, max: 100 }),
        (pages, seed) => {
          const uniquePages = [...new Map(pages.map((p) => [p.id, p])).values()];
          fc.pre(uniquePages.length >= 1);

          // Random subset of IDs to link
          const linkedCount = seed % (uniquePages.length + 1);
          const linkedIds = new Set(uniquePages.slice(0, linkedCount).map((p) => p.id));

          const result = disambiguate(uniquePages, linkedIds);
          if (result !== null) {
            expect(linkedIds.has(result.id)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('always selects the sole unlinked page when exactly one exists', () => {
    fc.assert(
      fc.property(pagesArb, (pages) => {
        // Deduplicate
        const uniquePages = [...new Map(pages.map((p) => [p.id, p])).values()];
        fc.pre(uniquePages.length >= 2);

        // Link all but the last one
        const linkedIds = new Set(uniquePages.slice(0, -1).map((p) => p.id));
        const soleUnlinked = uniquePages[uniquePages.length - 1];

        const result = disambiguate(uniquePages, linkedIds);
        expect(result).not.toBeNull();
        expect(result!.id).toBe(soleUnlinked.id);
        expect(result!.updatedAt).toBe(soleUnlinked.updatedAt);
      }),
      { numRuns: 100 },
    );
  });
});
