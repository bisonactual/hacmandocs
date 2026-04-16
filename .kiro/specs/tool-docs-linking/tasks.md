# Implementation Plan: Tool Docs Linking

## Overview

This plan implements the bidirectional linking between tool records and documentation pages. Tasks are ordered by dependency: schema migration first, then the backend service layer, then route integration, then frontend changes, and finally wiring and testing. Each task references specific requirements from the requirements document.

## Tasks

- [x] 1. Database schema changes
  - [x] 1.1 Create migration file `packages/worker/drizzle/0011_add_tool_docs_linking.sql`
    - Add `doc_page_id TEXT REFERENCES documents(id)` nullable column to `tool_records`
    - Add `no_induction_needed INTEGER DEFAULT 0` nullable column to `tool_records`
    - Use two `ALTER TABLE tool_records ADD COLUMN` statements (non-destructive, additive)
    - _Requirements: 8.1, 5.1_

  - [x] 1.2 Update Drizzle schema in `packages/worker/src/db/schema.ts`
    - Add `docPageId: text("doc_page_id").references(() => documents.id)` to `toolRecords`
    - Add `noInductionNeeded: integer("no_induction_needed").default(0)` to `toolRecords`
    - _Requirements: 8.1, 5.1_

- [x] 2. Implement Tool_Docs_Service content utilities
  - [x] 2.1 Create `packages/worker/src/services/tool-docs.ts` with content manipulation functions
    - Implement `buildToolDocsContent(toolId, toolName, quizDescription)` — produces a ProseMirror doc node with `trainingLink` at index 0, `details` (with `data-system-managed: true` attr and `detailsSummary` containing "About this tool") at index 1, and an empty paragraph at index 2
    - Use `parseMarkdown()` from `@hacmandocs/shared` to convert quiz description markdown to ProseMirror nodes; use placeholder text "No additional information available for this tool" when description is null/empty
    - Implement `replaceDescriptionSection(existingContent, newQuizDescription)` — replaces the `details` node at index 1 while preserving trainingLink at index 0 and all user-authored content at index >= 2
    - Implement `updateTrainingLink(existingContent, newToolName)` — updates the `toolName` attr on the trainingLink node at index 0, preserving all other content
    - Implement `removeSystemNodes(existingContent)` — removes the trainingLink node, removes the `data-system-managed` attr from the details node, preserves all user-authored content
    - Implement `validateLockedEdit(existingContent, proposedContent)` — returns error message if the proposed edit modifies trainingLink (index 0) or descriptionSection (index 1), returns null if only content at index >= 2 is changed
    - _Requirements: 3.2, 3.3, 4.3, 4.4, 4.5, 4.6, 9.1, 9.2, 9.5, 10.4, 10.5, 10.6, 11.1, 11.4, 12.3_

  - [ ]* 2.2 Write property test for `buildToolDocsContent` (Property 3)
    - **Property 3: Generated page content structure**
    - Generate random tool names and quiz descriptions (including null). Call `buildToolDocsContent`. Verify trainingLink at index 0 with correct toolId/toolName attrs, details at index 1 with `data-system-managed: true` and detailsSummary "About this tool", description content parsed or placeholder when null
    - **Validates: Requirements 3.2, 4.3, 9.1, 9.2, 11.1**

  - [ ]* 2.3 Write property test for `replaceDescriptionSection` (Property 4)
    - **Property 4: Description sync preserves user content**
    - Generate random page content (trainingLink + details + N random user-authored paragraph nodes). Generate random new descriptions. Call `replaceDescriptionSection`. Verify all user-authored nodes at index >= 2 are identical in order and content
    - **Validates: Requirements 4.1, 4.4**

  - [ ]* 2.4 Write property test for `updateTrainingLink` (Property 6)
    - **Property 6: Rename propagates to page title and Training_Link**
    - Generate random page content with trainingLink + details + user nodes. Call `updateTrainingLink` with a new name. Verify trainingLink toolName updated, all other content preserved
    - **Validates: Requirements 7.1, 11.3**

  - [x] 2.5 Write property test for `validateLockedEdit` — rejects (Property 8)
    - **Property 8: Locked page rejects system-managed field edits**
    - Generate random linked page content. Generate edits that modify the trainingLink node or descriptionSection node. Verify `validateLockedEdit` returns a non-null error message for each
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.6, 13.2**

  - [x] 2.6 Write property test for `validateLockedEdit` — allows (Property 9)
    - **Property 9: Locked page allows user content edits**
    - Generate random linked page content. Generate edits that only modify/add/remove nodes at index >= 2 while keeping index 0 and 1 identical. Verify `validateLockedEdit` returns null
    - **Validates: Requirements 10.5**

  - [x] 2.7 Write property test for `removeSystemNodes` (Property 10)
    - **Property 10: Release removes system nodes and preserves page**
    - Generate random page content with trainingLink + details + user nodes. Call `removeSystemNodes`. Verify trainingLink is absent, `data-system-managed` attr removed from details, all user-authored content preserved in order
    - **Validates: Requirements 11.4, 12.1, 12.3, 12.4**

- [x] 3. Implement Tool_Docs_Service database operations
  - [x] 3.1 Implement `ensureEquipmentCategory(db)` in `tool-docs.ts`
    - Find or create "Workshop Info" top-level category (parentId: null, match by name)
    - Find or create "Equipment" child category (parentId: workshop_info_id, match by name)
    - Return the Equipment category ID
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Implement disambiguation function `findUnlinkedPageByTitle(db, title, equipmentCategoryId)`
    - Query documents with matching title under the Equipment category
    - Exclude pages already referenced by any `toolRecords.docPageId`
    - Among remaining unlinked pages, select the one with the most recent `updatedAt`
    - Log warning when multiple matches found (include tool name, count, IDs, selected page)
    - _Requirements: 8.4, 8.5, 12.5, 12.6_

  - [x] 3.3 Write property test for disambiguation (Property 7)
    - **Property 7: Disambiguation selects correct unlinked page**
    - Generate random sets of pages with same title, some linked (docPageId set) and some unlinked, varying `updatedAt`. Call disambiguation logic. Verify selection is unlinked and has the most recent `updatedAt`
    - **Validates: Requirements 8.4, 8.5, 12.5, 12.6**

  - [x] 3.4 Implement `ensureDocsPage(params)` in `tool-docs.ts`
    - Ensure Equipment category exists via `ensureEquipmentCategory`
    - Call `findUnlinkedPageByTitle` to check for an orphaned page with matching title
    - If orphaned page found: re-link it — insert trainingLink, update descriptionSection with current quiz description, set `docPageId` on tool record
    - If no orphaned page: create a new docs page using `buildToolDocsContent`, set `isPublished = 1`, `categoryId = equipmentCategoryId`, sync FTS5 index, set `docPageId` on tool record
    - Return `docPageId` on success, null on failure (log error)
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 8.2, 8.6, 12.5, 12.7, 12.8, 13.1_

  - [ ]* 3.5 Write property test for `ensureDocsPage` (Property 2)
    - **Property 2: Auto-creation produces correct page**
    - Generate random tool names and quiz descriptions (including null). Call `ensureDocsPage` with mocked DB. Verify page title matches tool name, categoryId equals Equipment category, isPublished is 1, docPageId is set
    - **Validates: Requirements 2.1, 2.3, 3.1, 3.4, 3.6, 8.2, 13.1**

  - [ ]* 3.6 Write property test for re-link (Property 11)
    - **Property 11: Re-link restores system nodes on orphaned page**
    - Generate random orphaned page content (no trainingLink, details without system attr, user nodes). Call ensureDocsPage re-link logic. Verify trainingLink at index 0, details at index 1 with system-managed attr, user content preserved below
    - **Validates: Requirements 12.8**

  - [x] 3.7 Implement `syncDescription(params)` in `tool-docs.ts`
    - Fetch docs page by docPageId, parse contentJson
    - Call `replaceDescriptionSection` with new quiz description
    - Update the page's contentJson and FTS5 index
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 3.8 Implement `syncRename(params)` in `tool-docs.ts`
    - Fetch docs page by docPageId, update title
    - Parse contentJson, call `updateTrainingLink` with new name
    - Update page contentJson, title, and FTS5 index
    - _Requirements: 7.1, 7.2, 11.3_

  - [x] 3.9 Implement `releaseDocsPage(params)` in `tool-docs.ts`
    - If `docPageId` is null, no-op (graceful handling for pre-migration rows)
    - Fetch docs page, parse contentJson, call `removeSystemNodes`
    - Update page contentJson
    - Set `docPageId` to null on the tool record
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Integrate Tool_Docs_Service into tool CRUD routes
  - [x] 5.1 Extend `POST /tools` in `packages/worker/src/routes/inductions.ts`
    - Accept `noInductionNeeded` in the request body and store it on the tool record
    - After tool record insert, call `ensureDocsPage` with the tool name and quiz description (fetch quiz description from quizzes table if quizId is provided)
    - If `ensureDocsPage` returns a docPageId, update the tool record's `docPageId`
    - Wrap in try/catch — log errors but never fail tool creation
    - _Requirements: 3.1, 3.4, 3.5, 5.2, 8.2_

  - [x] 5.2 Extend `PUT /tools/:id` in `packages/worker/src/routes/inductions.ts`
    - Accept `noInductionNeeded` in the request body and update the tool record
    - If tool name changed and `docPageId` is non-null, call `syncRename`
    - Wrap sync in try/catch — log errors but never fail tool rename
    - _Requirements: 7.1, 7.3, 5.2_

  - [x] 5.3 Extend `DELETE /tools/:id` in `packages/worker/src/routes/inductions.ts`
    - Before deleting the tool record, call `releaseDocsPage` with tool's `docPageId`
    - Wrap release in try/catch — log errors but never fail tool deletion
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 5.4 Add `POST /tools/:id/repair-link` route in `packages/worker/src/routes/inductions.ts`
    - Fetch tool record, fetch quiz description if quizId is set
    - Call `ensureDocsPage` with current tool name and quiz description
    - Update `docPageId` on the tool record; return 200 with docPageId on success, 500 on failure
    - Require Admin or Manager role
    - _Requirements: 8.3, 8.4_

  - [x] 5.5 Extend quiz update route `PUT /quizzes/:id` in `packages/worker/src/routes/inductions.ts`
    - After quiz description update, find all tool records referencing this quiz (quizId, preInductionQuizId, or refresherQuizId) that have a non-null `docPageId`
    - Call `syncDescription` for each linked tool's docs page
    - Wrap in try/catch — log errors per page, never fail quiz update
    - _Requirements: 4.1, 4.2_

- [x] 6. Extend document routes with page lock guards
  - [x] 6.1 Add `getLinkedToolRecord` helper in `packages/worker/src/routes/documents.ts`
    - Query `toolRecords` for any row where `docPageId` equals the given document ID
    - Return the tool record if found, null otherwise
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 6.2 Guard `PUT /:id` in document routes
    - Before applying updates, call `getLinkedToolRecord`
    - If linked: reject title changes, categoryId changes; call `validateLockedEdit` on content changes — reject if it returns an error message
    - If not linked: normal edit flow
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.6, 10.7_

  - [x] 6.3 Guard `DELETE /:id` in document routes
    - Before deleting, call `getLinkedToolRecord`
    - If linked: return 400 with message "This page is linked to a tool record and cannot be deleted."
    - _Requirements: 10.3, 10.7_

  - [x] 6.4 Guard `PUT /:id/publish` in document routes
    - Before unpublishing, call `getLinkedToolRecord`
    - If linked and body.published is false: return 400 with message "This page is linked to a tool record and must remain published."
    - _Requirements: 13.2_

- [x] 7. Extend profile API response
  - [x] 7.1 Update `GET /profile/me` in `packages/worker/src/routes/inductions.ts`
    - Include `docPageId`, `docPagePublished` (boolean derived from joined `documents.isPublished`), `noInductionNeeded`, `areaId`, and `areaName` in each tool's response data
    - Left-join `documents` on `toolRecords.docPageId = documents.id` to fetch `isPublished`; if the joined document is missing (deleted), treat as `docPagePublished = false`
    - Fetch tool areas to map `areaId` to `areaName`
    - Add a new `noInductionNeeded` section to the profile response containing tools with `noInductionNeeded = 1` that have no certifications
    - _Requirements: 1.1, 1.2, 5.3, 5.5, 13.3_

  - [ ]* 7.2 Write property test for tool partitioning (Property 1)
    - **Property 1: Tool partitioning completeness**
    - Generate random tool sets with varying cert states, quiz associations, noInductionNeeded flags, and member certs. Verify each tool appears in exactly one section (available, completed, expired, or no-induction-needed), with no tool missing and no duplicates
    - **Validates: Requirements 1.1, 1.4, 5.3, 5.4, 5.5**

- [x] 8. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Frontend — My Training page enhancements
  - [x] 9.1 Add search input and area filter to `MemberProfilePage`
    - Add a text input for tool name search above the tool sections
    - Add an area filter dropdown populated from the distinct `areaName` values in the profile data
    - Implement client-side filtering: case-insensitive name match AND areaId match (both filters combined with AND)
    - Apply filters across all tool sections (available, completed, expired, no-induction-needed)
    - When both filters are empty/cleared, show all tools unfiltered
    - Show "No tools found matching your filters." empty state when filter returns no results
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [ ]* 9.2 Write property test for client-side filter (Property 5)
    - **Property 5: Client-side filter correctness**
    - Generate random tool lists with names and areaIds, random search strings, random selected areaIds. Apply filter function. Verify results match both criteria; empty filters return all
    - **Validates: Requirements 6.2, 6.4, 6.5, 6.6, 6.7**

  - [x] 9.3 Render tool names as clickable links on `MemberProfilePage`
    - For each tool with a non-null `docPageId` AND `docPagePublished === true`: render the tool name as a `<Link>` to `/docs/{docPageId}`
    - For tools with null `docPageId` or `docPagePublished === false`: render the tool name as plain text
    - Apply this to all sections (available, completed, expired, no-induction-needed)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 13.3_

  - [x] 9.4 Add "No Induction Needed" section to `MemberProfilePage`
    - Render tools with `noInductionNeeded = true` in a separate section
    - Do NOT show "Start Quiz" or "Mark Me Trained" buttons for these tools
    - Still show the clickable link to the docs page if `docPageId` is set
    - _Requirements: 5.3, 5.4, 5.5_

- [x] 10. Frontend — Admin Tools page enhancements
  - [x] 10.1 Add `noInductionNeeded` checkbox to the tool form in `ToolsPage.tsx`
    - Add a checkbox field in the create/edit form for `noInductionNeeded`
    - Include `noInductionNeeded` in the POST/PUT request payload
    - _Requirements: 5.2_

  - [x] 10.2 Add "Repair Link" button per tool row in `ToolsPage.tsx`
    - Add a "Repair Link" button in the actions column of each tool row
    - On click, POST to `/api/inductions/tools/:id/repair-link`
    - Show success feedback (e.g. brief "Linked!" message) or error feedback on failure
    - _Requirements: 8.3_

- [x] 11. Frontend — RichTextEditor extensions for custom ProseMirror nodes
  - [x] 11.1 Add `trainingLink` TipTap node extension in `RichTextEditor.tsx`
    - Define a custom TipTap node for `trainingLink` with `toolId` and `toolName` attrs
    - Render as a read-only navigable link with text like "View training status for [toolName]" pointing to `/inductions/profile#tool-{toolId}`
    - Mark as non-editable (atom node or nodeView with `contentEditable: false`)
    - _Requirements: 11.1, 11.2_

  - [x] 11.2 Add or extend `details`/`detailsSummary` TipTap node extension in `RichTextEditor.tsx`
    - Support the `data-system-managed` attribute on `details` nodes
    - When `data-system-managed` is true, render the details content as non-editable (visual indicator like a bordered container with a lock icon or "System managed" label)
    - Render the details section collapsed by default in the viewer
    - Apply a visually distinct bordered container style matching design spec
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.4_

- [x] 12. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP (content structure, description sync, rename, re-link, partitioning, and client-side filter property tests)
- Property tests for disambiguation (3.3), lock validation (2.5, 2.6), and release (2.7) are REQUIRED — these cover the riskiest backend behaviors
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after backend service and after route integration
- Property tests validate universal correctness properties from the design document using Vitest + fast-check
- All migrations are non-destructive and additive (ALTER TABLE ADD COLUMN)
- Tool_Docs_Service errors never block tool CRUD operations — errors are logged and operations proceed
