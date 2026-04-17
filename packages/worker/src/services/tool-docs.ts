import type { DocumentNode } from '@hacmandocs/shared';
import { parseMarkdown } from '@hacmandocs/shared';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { categories, documents, toolRecords } from '../db/schema';
import { extractPlainText } from '../routes/documents';

// ── Node type interfaces ─────────────────────────────────────────────

export interface TrainingLinkNode extends DocumentNode {
  type: 'trainingLink';
  attrs: {
    toolId: string;
    toolName: string;
  };
}

export interface DescriptionSectionNode extends DocumentNode {
  type: 'details';
  attrs: {
    'data-system-managed': true;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

const PLACEHOLDER_TEXT = 'No additional information available for this tool';

function buildDescriptionSection(quizDescription: string | null): DescriptionSectionNode {
  const markdown = quizDescription?.trim() || null;
  const descriptionNodes: DocumentNode[] = markdown
    ? (parseMarkdown(markdown).content ?? [])
    : [{ type: 'paragraph', content: [{ type: 'text', text: PLACEHOLDER_TEXT }] }];

  return {
    type: 'details',
    attrs: { 'data-system-managed': true },
    content: [
      {
        type: 'detailsSummary',
        content: [{ type: 'text', text: 'About this tool' }],
      },
      ...descriptionNodes,
    ],
  };
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Build the initial content JSON for a tool docs page.
 * Produces: [TrainingLink, DescriptionSection, empty paragraph]
 */
export function buildToolDocsContent(
  toolId: string,
  toolName: string,
  quizDescription: string | null,
): DocumentNode {
  const trainingLink: TrainingLinkNode = {
    type: 'trainingLink',
    attrs: { toolId, toolName },
  };

  const details = buildDescriptionSection(quizDescription);

  const emptyParagraph: DocumentNode = {
    type: 'paragraph',
    content: [{ type: 'text', text: '' }],
  };

  return {
    type: 'doc',
    content: [trainingLink, details, emptyParagraph],
  };
}

/**
 * Replace the Description_Section (index 1) in existing page content
 * while preserving trainingLink (index 0) and all user content (index >= 2).
 */
export function replaceDescriptionSection(
  existingContent: DocumentNode,
  newQuizDescription: string | null,
): DocumentNode {
  const nodes = existingContent.content ?? [];
  const newDetails = buildDescriptionSection(newQuizDescription);

  return {
    ...existingContent,
    content: [
      nodes[0],       // trainingLink at index 0
      newDetails,     // new details at index 1
      ...nodes.slice(2), // user-authored content at index >= 2
    ],
  };
}

/**
 * Update the toolName attr on the trainingLink node (index 0),
 * preserving all other content.
 */
export function updateTrainingLink(
  existingContent: DocumentNode,
  newToolName: string,
): DocumentNode {
  const nodes = existingContent.content ?? [];
  const existingLink = nodes[0];

  const updatedLink: TrainingLinkNode = {
    ...existingLink,
    type: 'trainingLink',
    attrs: {
      ...(existingLink.attrs as TrainingLinkNode['attrs']),
      toolName: newToolName,
    },
  };

  return {
    ...existingContent,
    content: [updatedLink, ...nodes.slice(1)],
  };
}

/**
 * Remove the trainingLink node, remove the `data-system-managed` attr
 * from the details node, and preserve all user-authored content.
 */
export function removeSystemNodes(
  existingContent: DocumentNode,
): DocumentNode {
  const nodes = existingContent.content ?? [];
  // nodes[0] = trainingLink (remove)
  // nodes[1] = details (strip system attr)
  // nodes[2..] = user content (preserve)

  const detailsNode = nodes[1];
  const cleanedDetails: DocumentNode = {
    ...detailsNode,
    attrs: Object.fromEntries(
      Object.entries(detailsNode.attrs ?? {}).filter(
        ([key]) => key !== 'data-system-managed',
      ),
    ),
  };
  // Remove attrs entirely if empty
  if (Object.keys(cleanedDetails.attrs!).length === 0) {
    delete cleanedDetails.attrs;
  }

  return {
    ...existingContent,
    content: [cleanedDetails, ...nodes.slice(2)],
  };
}

/**
 * Validate that a proposed edit does not modify the trainingLink (index 0)
 * or descriptionSection (index 1). Returns an error message string if
 * locked nodes were modified, null if only user content (index >= 2) changed.
 */
export function validateLockedEdit(
  existingContent: DocumentNode,
  proposedContent: DocumentNode,
): string | null {
  const existingNodes = existingContent.content ?? [];
  const proposedNodes = proposedContent.content ?? [];

  const existingLink = JSON.stringify(existingNodes[0]);
  const proposedLink = JSON.stringify(proposedNodes[0]);

  if (existingLink !== proposedLink) {
    return 'The training link is system-managed and cannot be edited while a tool is linked.';
  }

  const existingDetails = JSON.stringify(existingNodes[1]);
  const proposedDetails = JSON.stringify(proposedNodes[1]);

  if (existingDetails !== proposedDetails) {
    return "The 'About this tool' section is system-managed and cannot be edited while a tool is linked.";
  }

  return null;
}

// ── Database Operations ──────────────────────────────────────────────

/**
 * Ensure the "Workshop Info" > "Equipment" category path exists.
 * Creates either or both categories if they don't exist.
 * Returns the Equipment category ID.
 */
export async function ensureEquipmentCategory(
  rawDb: D1Database,
  areaName: string,
): Promise<string> {
  const db = drizzle(rawDb);
  const now = Math.floor(Date.now() / 1000);

  // Find or create "Workshop Info" top-level category
  const [existingWorkshop] = await db
    .select()
    .from(categories)
    .where(and(sql`LOWER(${categories.name}) = LOWER(${'Workshop Info'})`, isNull(categories.parentId)))
    .limit(1);

  let workshopId: string;
  if (existingWorkshop) {
    workshopId = existingWorkshop.id;
  } else {
    workshopId = crypto.randomUUID();
    await db.insert(categories).values({
      id: workshopId,
      name: 'Workshop Info',
      parentId: null,
      sortOrder: 0,
      createdAt: now,
    });
  }

  // Find or create the area category under Workshop Info (e.g. "Metalwork", "Visual Arts")
  const [existingArea] = await db
    .select()
    .from(categories)
    .where(and(sql`LOWER(${categories.name}) = LOWER(${areaName})`, eq(categories.parentId, workshopId)))
    .limit(1);

  let areaId: string;
  if (existingArea) {
    areaId = existingArea.id;
  } else {
    areaId = crypto.randomUUID();
    await db.insert(categories).values({
      id: areaId,
      name: areaName,
      parentId: workshopId,
      sortOrder: 0,
      createdAt: now,
    });
  }

  // Find or create "Equipment" child category under the area
  const [existingEquipment] = await db
    .select()
    .from(categories)
    .where(and(sql`LOWER(${categories.name}) = LOWER(${'Equipment'})`, eq(categories.parentId, areaId)))
    .limit(1);

  if (existingEquipment) {
    return existingEquipment.id;
  }

  const equipmentId = crypto.randomUUID();
  await db.insert(categories).values({
    id: equipmentId,
    name: 'Equipment',
    parentId: areaId,
    sortOrder: 0,
    createdAt: now,
  });

  return equipmentId;
}

/**
 * Find an unlinked docs page by title under the Equipment category.
 * Excludes pages already referenced by any toolRecords.docPageId.
 * Returns the most recently updated match, or null if none found.
 * Logs a warning when multiple matches are found.
 */
export async function findUnlinkedPageByTitle(
  rawDb: D1Database,
  title: string,
  equipmentCategoryId: string,
): Promise<{ id: string; contentJson: string; updatedAt: number } | null> {
  const db = drizzle(rawDb);

  // Get all docPageIds currently linked to tool records
  const linkedRows = await db
    .select({ docPageId: toolRecords.docPageId })
    .from(toolRecords);
  const linkedIds = new Set(
    linkedRows.map((r) => r.docPageId).filter((id): id is string => id != null),
  );

  // Find all docs with matching title under the Equipment category
  const candidates = await db
    .select({
      id: documents.id,
      contentJson: documents.contentJson,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(and(eq(documents.title, title), eq(documents.categoryId, equipmentCategoryId)))
    .orderBy(desc(documents.updatedAt));

  // Filter out linked pages
  const unlinked = candidates.filter((doc) => !linkedIds.has(doc.id));

  if (unlinked.length === 0) return null;

  if (unlinked.length > 1) {
    console.warn(
      `[tool-docs] Disambiguation: found ${unlinked.length} unlinked pages matching title "${title}". ` +
      `IDs: ${unlinked.map((d) => d.id).join(', ')}. Selected: ${unlinked[0].id}`,
    );
  }

  return unlinked[0];
}

/**
 * Ensure a docs page exists for a tool. Creates a new page or re-links
 * an orphaned page with matching title. Returns the docPageId on success,
 * null on failure.
 */
export async function ensureDocsPage(params: {
  db: D1Database;
  toolId: string;
  toolName: string;
  areaName: string;
  quizDescription: string | null;
  createdBy: string;
}): Promise<string | null> {
  const { db: rawDb, toolId, toolName, areaName, quizDescription, createdBy } = params;

  try {
    const equipmentCategoryId = await ensureEquipmentCategory(rawDb, areaName);
    const orphanedPage = await findUnlinkedPageByTitle(rawDb, toolName, equipmentCategoryId);
    const db = drizzle(rawDb);
    const now = Math.floor(Date.now() / 1000);

    if (orphanedPage) {
      // Re-link orphaned page: rebuild content with system nodes
      const existingContent = JSON.parse(orphanedPage.contentJson) as DocumentNode;
      const newContent = buildToolDocsContent(toolId, toolName, quizDescription);

      // Preserve user content: take system nodes from new content, user nodes from existing
      // Orphaned pages had removeSystemNodes called, so index 0 is the cleaned details node
      // and index 1+ is user content. We prepend trainingLink and new details.
      const userNodes = existingContent.content?.slice(1) ?? [];
      const rebuiltContent: DocumentNode = {
        type: 'doc',
        content: [
          newContent.content![0], // trainingLink
          newContent.content![1], // description section
          ...userNodes,
        ],
      };

      const contentJsonStr = JSON.stringify(rebuiltContent);
      const contentText = extractPlainText(rebuiltContent);

      await db
        .update(documents)
        .set({
          contentJson: contentJsonStr,
          isPublished: 1,
          updatedAt: now,
        })
        .where(eq(documents.id, orphanedPage.id));

      // Sync FTS
      await rawDb
        .prepare('DELETE FROM document_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)')
        .bind(orphanedPage.id)
        .run();
      await rawDb
        .prepare('INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)')
        .bind(orphanedPage.id, toolName, contentText)
        .run();

      // Link tool record to the page
      await db
        .update(toolRecords)
        .set({ docPageId: orphanedPage.id, updatedAt: now })
        .where(eq(toolRecords.id, toolId));

      return orphanedPage.id;
    }

    // No orphaned page — create new
    const content = buildToolDocsContent(toolId, toolName, quizDescription);
    const contentJsonStr = JSON.stringify(content);
    const contentText = extractPlainText(content);
    const docId = crypto.randomUUID();

    await db.insert(documents).values({
      id: docId,
      title: toolName,
      contentJson: contentJsonStr,
      categoryId: equipmentCategoryId,
      isSensitive: 0,
      isPublished: 1,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // Sync FTS
    await rawDb
      .prepare('INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)')
      .bind(docId, toolName, contentText)
      .run();

    // Link tool record to the page
    await db
      .update(toolRecords)
      .set({ docPageId: docId, updatedAt: now })
      .where(eq(toolRecords.id, toolId));

    return docId;
  } catch (err) {
    console.error('[tool-docs] ensureDocsPage failed:', err);
    return null;
  }
}

/**
 * Sync the Description_Section from quiz description markdown.
 * Fetches the page, replaces the description, updates contentJson + FTS.
 */
export async function syncDescription(params: {
  db: D1Database;
  docPageId: string;
  quizDescription: string | null;
}): Promise<void> {
  const { db: rawDb, docPageId, quizDescription } = params;
  const db = drizzle(rawDb);

  const [page] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, docPageId))
    .limit(1);

  if (!page) return;

  const existingContent = JSON.parse(page.contentJson) as DocumentNode;
  const updatedContent = replaceDescriptionSection(existingContent, quizDescription);
  const contentJsonStr = JSON.stringify(updatedContent);
  const contentText = extractPlainText(updatedContent);
  const now = Math.floor(Date.now() / 1000);

  await db
    .update(documents)
    .set({ contentJson: contentJsonStr, updatedAt: now })
    .where(eq(documents.id, docPageId));

  // Sync FTS
  await rawDb
    .prepare('DELETE FROM document_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)')
    .bind(docPageId)
    .run();
  await rawDb
    .prepare('INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)')
    .bind(docPageId, page.title, contentText)
    .run();
}

/**
 * Update the page title and Training_Link on tool rename.
 * Fetches the page, updates title + trainingLink toolName + FTS.
 */
export async function syncRename(params: {
  db: D1Database;
  docPageId: string;
  newToolName: string;
}): Promise<void> {
  const { db: rawDb, docPageId, newToolName } = params;
  const db = drizzle(rawDb);

  const [page] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, docPageId))
    .limit(1);

  if (!page) return;

  const existingContent = JSON.parse(page.contentJson) as DocumentNode;
  const updatedContent = updateTrainingLink(existingContent, newToolName);
  const contentJsonStr = JSON.stringify(updatedContent);
  const contentText = extractPlainText(updatedContent);
  const now = Math.floor(Date.now() / 1000);

  await db
    .update(documents)
    .set({ title: newToolName, contentJson: contentJsonStr, updatedAt: now })
    .where(eq(documents.id, docPageId));

  // Sync FTS
  await rawDb
    .prepare('DELETE FROM document_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)')
    .bind(docPageId)
    .run();
  await rawDb
    .prepare('INSERT INTO document_fts(rowid, title, content_text) VALUES ((SELECT rowid FROM documents WHERE id = ?), ?, ?)')
    .bind(docPageId, newToolName, contentText)
    .run();
}

/**
 * Release a docs page: remove system nodes, set docPageId to null.
 * If docPageId is null, this is a no-op (graceful handling for pre-migration rows).
 */
export async function releaseDocsPage(params: {
  db: D1Database;
  toolId: string;
  docPageId: string | null;
}): Promise<void> {
  const { db: rawDb, toolId, docPageId } = params;

  if (docPageId == null) return;

  const db = drizzle(rawDb);

  const [page] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, docPageId))
    .limit(1);

  if (!page) return;

  const existingContent = JSON.parse(page.contentJson) as DocumentNode;
  const cleanedContent = removeSystemNodes(existingContent);
  const contentJsonStr = JSON.stringify(cleanedContent);
  const now = Math.floor(Date.now() / 1000);

  await db
    .update(documents)
    .set({ contentJson: contentJsonStr, updatedAt: now })
    .where(eq(documents.id, docPageId));

  // Set docPageId to null on the tool record
  await db
    .update(toolRecords)
    .set({ docPageId: null, updatedAt: now })
    .where(eq(toolRecords.id, toolId));
}
