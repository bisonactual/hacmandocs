# Requirements Document

## Introduction

The Tool Docs Linking feature connects the tool induction system with the documentation system. Every tool record — regardless of whether it requires certification — becomes a clickable link on the My Training page, leading to a dedicated documentation page in the docs system. Tool documentation pages are auto-created under a fixed path (Workshop Info > Equipment > [Tool Name]), and the quiz description content (title and description only — not quiz questions or answers) is synced to the top of each docs page as a collapsible "About this tool" section. Tools can be flagged as "no induction needed" so they appear in the training page even without any quiz or certification requirement. The My Training page also gains search and filter capabilities including filtering by workshop area. Each docs page is treated as a system-managed asset while the tool link exists: the title, category, "About this tool" section, and page existence are locked, while all other page content remains manually editable by docs editors. Docs pages include a bidirectional link back to the tool on My Training, and tool deletion gracefully releases the docs page for normal editing.

## Glossary

- **Tool_Record**: A database record representing a tool or machine in the makerspace, stored in the `toolRecords` table.
- **Docs_Page**: A document in the documentation system, stored in the `documents` table with ProseMirror JSON content.
- **Equipment_Category**: The fixed category path "Workshop Info > Equipment" in the docs system category tree, under which all tool documentation pages are created.
- **Description_Section**: A collapsible "About this tool" section near the top of a tool's Docs_Page, containing content synced from the associated quiz description field (not quiz questions or answers).
- **No_Induction_Flag**: A boolean flag (`noInductionNeeded`) on a Tool_Record indicating the tool does not require any quiz or certification to use.
- **Tool_Docs_Service**: The backend service responsible for auto-creating, syncing, locking, unlocking, and renaming tool documentation pages.
- **My_Training_Page**: The member-facing page (`MemberProfilePage`) that lists all tools and their certification status.
- **Certification_Status**: The computed status of a member's certification for a tool: `active`, `expiring_soon`, `expired`, or `none`.
- **Tool_Area**: A workshop area (e.g. Metal, Wood, Laser, Textiles) to which a Tool_Record may be assigned, stored in the `toolAreas` table.
- **Training_Link**: A link displayed at the top of a Docs_Page that navigates back to the corresponding tool on the My_Training_Page.
- **Page_Lock**: A system-managed state on a Docs_Page that prevents editors from renaming, moving, deleting, or editing the system-managed sections while the associated Tool_Record exists.

## Requirements

### Requirement 1: Clickable Tool Links on My Training Page

**User Story:** As a makerspace member, I want every tool listed on the My Training page to be a clickable link to its documentation page, so that I can quickly access tool-specific information regardless of my certification status.

#### Acceptance Criteria

1. THE My_Training_Page SHALL render every Tool_Record that exists in the database as an entry in the tool listing, regardless of certification state, quiz association, or No_Induction_Flag value.
2. THE My_Training_Page SHALL render every Tool_Record name as a clickable link that navigates to the corresponding Docs_Page in the documentation system.
3. WHEN a member clicks a Tool_Record link, THE My_Training_Page SHALL navigate to the Docs_Page viewer route for that tool's documentation page.
4. THE My_Training_Page SHALL render Tool_Record links as clickable regardless of the member's Certification_Status for that tool (active, expiring_soon, expired, or none).
5. WHEN a Tool_Record has a null `docPageId`, THE My_Training_Page SHALL render the tool name as plain text without a link.

### Requirement 2: Fixed Documentation Path for Tool Pages

**User Story:** As a documentation reader, I want all tool documentation pages to live under a consistent path (Workshop Info > Equipment > [Tool Name]), so that I can find tool docs in a predictable location.

#### Acceptance Criteria

1. THE Tool_Docs_Service SHALL create all tool Docs_Pages under the Equipment_Category path: "Workshop Info" > "Equipment" > [Tool_Record name].
2. THE Tool_Docs_Service SHALL ensure the "Workshop Info" and "Equipment" categories exist in the category tree, creating them if they do not exist.
3. THE Tool_Docs_Service SHALL NOT nest tool Docs_Pages under area-specific subcategories; all tool pages SHALL be direct children of the "Equipment" category regardless of the Tool_Record's area assignment.

### Requirement 3: Auto-Creation of Documentation Pages

**User Story:** As an admin, I want a documentation page to be automatically created when I save a new tool, so that I do not have to manually create docs pages for each tool.

#### Acceptance Criteria

1. WHEN a new Tool_Record is created, THE Tool_Docs_Service SHALL automatically create a corresponding Docs_Page with the title matching the Tool_Record name, placed under the Equipment_Category.
2. WHEN a new Tool_Record is created and the associated quiz has a description, THE Tool_Docs_Service SHALL populate the Description_Section of the new Docs_Page with the quiz description content only (not quiz questions or answers).
3. WHEN a new Tool_Record is created and no quiz description exists, THE Tool_Docs_Service SHALL create the Docs_Page with a Description_Section containing placeholder text "No additional information available for this tool".
4. THE Tool_Docs_Service SHALL store a reference linking the Tool_Record to its corresponding Docs_Page so the relationship is maintained.
5. IF the Docs_Page creation fails, THEN THE Tool_Docs_Service SHALL log the error and still complete the Tool_Record creation successfully.
6. WHEN a new Docs_Page is auto-created, THE Tool_Docs_Service SHALL set the `isPublished` flag to 1 so that the page is visible to all members.

### Requirement 4: Quiz Description Sync to Documentation Page

**User Story:** As an admin, I want the quiz description content to automatically sync to the top of the tool's documentation page when I update it, so that the docs page always reflects the latest tool information.

#### Acceptance Criteria

1. WHEN a quiz description is updated, THE Tool_Docs_Service SHALL update the Description_Section of every Docs_Page linked to a Tool_Record that references that quiz.
2. THE Tool_Docs_Service SHALL sync only the quiz title and description fields to the Docs_Page; quiz questions and answers SHALL NOT be synced.
3. THE Tool_Docs_Service SHALL render the Description_Section as a collapsible section near the top of the Docs_Page content (below the Training_Link), with the heading "About this tool".
4. THE Tool_Docs_Service SHALL preserve all other content in the Docs_Page below the Description_Section when updating the synced content.
5. WHEN a quiz description is cleared (set to null or empty), THE Tool_Docs_Service SHALL update the Description_Section to display placeholder text "No additional information available for this tool".
6. THE Tool_Docs_Service SHALL convert the quiz description from markdown format to ProseMirror JSON before inserting it into the Docs_Page content.

### Requirement 5: No Induction Needed Flag

**User Story:** As an admin, I want to flag a tool as "no induction needed" when creating or editing it, so that all tools can be listed on the training page even if they do not require any certification.

#### Acceptance Criteria

1. THE Tool_Record schema SHALL include a nullable boolean column `noInductionNeeded` that defaults to false (0).
2. WHEN creating or editing a Tool_Record, THE admin interface SHALL provide a checkbox to set the No_Induction_Flag.
3. WHEN a Tool_Record has the No_Induction_Flag set to true, THE My_Training_Page SHALL display the tool in the listing without any quiz or certification actions.
4. WHEN a Tool_Record has the No_Induction_Flag set to true, THE My_Training_Page SHALL NOT display "Start Quiz" or "Mark Me Trained" buttons for that tool.
5. WHEN a Tool_Record has the No_Induction_Flag set to true and has no associated quizzes, THE My_Training_Page SHALL still display the tool with a clickable link to its Docs_Page.

### Requirement 6: Tool Search and Filter on My Training Page

**User Story:** As a makerspace member, I want to search tools by name and filter by workshop area on the My Training page, so that I can quickly find tools in a specific area or by name.

#### Acceptance Criteria

1. THE My_Training_Page SHALL display a text search input field that filters the displayed tools by name.
2. WHEN a member types in the search field, THE My_Training_Page SHALL filter the tool list to show only tools whose names contain the search text, using case-insensitive matching.
3. THE My_Training_Page SHALL display a workshop area filter that allows members to select a specific Tool_Area to filter the tool list.
4. WHEN a member selects a Tool_Area filter, THE My_Training_Page SHALL display only tools assigned to the selected Tool_Area.
5. WHEN both a text search and a Tool_Area filter are active, THE My_Training_Page SHALL display only tools matching both the name search and the selected area.
6. THE My_Training_Page SHALL apply the search and area filters across all tool sections (available training, active certifications, expired certifications, and no-induction-needed tools).
7. WHEN the search field is cleared and no area filter is selected, THE My_Training_Page SHALL display all tools in their original sections.
8. THE My_Training_Page SHALL perform the search and area filters on the client side without additional API calls.

### Requirement 7: Tool Rename Propagation to Documentation Page

**User Story:** As an admin, I want the documentation page title to update automatically when I rename a tool, so that the docs page always matches the current tool name.

#### Acceptance Criteria

1. WHEN a Tool_Record name is updated, THE Tool_Docs_Service SHALL update the title of the linked Docs_Page to match the new Tool_Record name.
2. WHEN a Tool_Record name is updated, THE Tool_Docs_Service SHALL update the FTS5 search index entry for the linked Docs_Page with the new title.
3. IF the Docs_Page title update fails, THEN THE Tool_Docs_Service SHALL log the error and still complete the Tool_Record rename successfully.

### Requirement 8: Tool-to-Document Linking Data Model

**User Story:** As a developer, I want a reliable mapping between tool records and their documentation pages, so that the system can maintain the link across renames and updates.

#### Acceptance Criteria

1. THE Tool_Record schema SHALL include a nullable column `docPageId` that references the `documents` table.
2. WHEN a Docs_Page is auto-created for a Tool_Record, THE Tool_Docs_Service SHALL store the Docs_Page ID in the Tool_Record's `docPageId` column.
3. THE Tool_Docs_Service SHALL use the `docPageId` reference for all sync and rename operations rather than matching by name.
4. WHEN a Tool_Record has a null `docPageId` and a sync or link operation is triggered, THE Tool_Docs_Service SHALL attempt to find an existing Docs_Page by title match under the Equipment_Category that is NOT already referenced by another Tool_Record's `docPageId`, and link it.
5. WHEN the title-match search under Requirement 8 criterion 4 finds multiple unlinked Docs_Pages, THE Tool_Docs_Service SHALL select the most recently updated Docs_Page (by `updatedAt` timestamp).
6. WHEN the title-match search under Requirement 8 criterion 4 finds no unlinked Docs_Page, THE Tool_Docs_Service SHALL create a new Docs_Page following the auto-creation rules in Requirement 3.
7. THE Tool_Record `name` column in the `toolRecords` table SHALL have a unique constraint, ensuring no two Tool_Records share the same name.

### Requirement 9: Description Section Format

**User Story:** As a documentation reader, I want the synced tool description to appear as a clearly delineated collapsible section, so that I can distinguish auto-synced content from manually authored documentation.

#### Acceptance Criteria

1. THE Description_Section SHALL be represented as a custom ProseMirror node of type `details` with a `summary` child containing the text "About this tool".
2. THE Description_Section SHALL appear below the Training_Link and above all manually authored content in the Docs_Page content JSON.
3. WHEN the Docs_Page is rendered in the document viewer, THE Description_Section SHALL be displayed as a collapsible/expandable section that is collapsed by default.
4. THE Description_Section SHALL be visually distinct from the rest of the document content, using a bordered container style.
5. WHEN a Tool_Record has no quiz description, THE Description_Section SHALL display the placeholder text "No additional information available for this tool".

### Requirement 10: Page Ownership and Source of Truth

**User Story:** As an admin, I want system-managed fields on a tool's docs page to be protected from manual edits while the tool link exists, so that synced content stays consistent and editors can still add their own content below.

#### Acceptance Criteria

1. WHILE a Docs_Page has an active link to a Tool_Record (via `docPageId`), THE Tool_Docs_Service SHALL prevent editors from changing the Docs_Page title.
2. WHILE a Docs_Page has an active link to a Tool_Record, THE Tool_Docs_Service SHALL prevent editors from moving the Docs_Page to a different category.
3. WHILE a Docs_Page has an active link to a Tool_Record, THE Tool_Docs_Service SHALL prevent editors from deleting the Docs_Page.
4. WHILE a Docs_Page has an active link to a Tool_Record, THE Tool_Docs_Service SHALL prevent editors from directly editing the Description_Section content in the Docs_Page.
5. WHILE a Docs_Page has an active link to a Tool_Record, THE Tool_Docs_Service SHALL allow editors to add, edit, and remove any content below the Description_Section.
6. WHILE a Docs_Page has an active link to a Tool_Record, THE Tool_Docs_Service SHALL prevent editors from editing or removing the Training_Link at the top of the page.
7. IF an editor attempts to rename, move, delete, or edit a locked section of a linked Docs_Page, THEN THE Tool_Docs_Service SHALL reject the operation and display a message indicating the field is system-managed by the tool link.

### Requirement 11: Bidirectional Linking Between Docs and Training

**User Story:** As a makerspace member viewing a tool's documentation page, I want a link back to the tool on My Training, so that I can easily navigate between the docs and my training status for that tool.

#### Acceptance Criteria

1. WHEN a Docs_Page is created or linked to a Tool_Record, THE Tool_Docs_Service SHALL insert a Training_Link as the first content node in the Docs_Page content JSON, above the Description_Section.
2. THE Training_Link SHALL display as a navigable link with text identifying the tool name and pointing to the tool's entry on the My_Training_Page.
3. WHEN a Tool_Record name is updated, THE Tool_Docs_Service SHALL update the Training_Link text on the linked Docs_Page to reflect the new tool name.
4. WHEN a Tool_Record is deleted and the Docs_Page is unlinked, THE Tool_Docs_Service SHALL remove the Training_Link from the Docs_Page content.

### Requirement 12: Tool Deletion and Docs Page Release

**User Story:** As an admin, I want deleting a tool to gracefully release its docs page so that the page becomes a normal editable document and re-creating a tool with the same name re-links the existing page.

#### Acceptance Criteria

1. WHEN a Tool_Record is deleted, THE Tool_Docs_Service SHALL remove the Page_Lock from the linked Docs_Page, allowing editors to rename, move, delete, and edit all sections.
2. WHEN a Tool_Record is deleted, THE Tool_Docs_Service SHALL set the `docPageId` column on the Tool_Record to null before deletion.
3. WHEN a Tool_Record is deleted, THE Tool_Docs_Service SHALL remove the Training_Link from the orphaned Docs_Page content.
4. WHEN a Tool_Record is deleted, THE Tool_Docs_Service SHALL NOT delete the linked Docs_Page; the page SHALL remain as a normal editable document.
5. WHEN a new Tool_Record is created with a name matching an existing orphaned Docs_Page title under the Equipment_Category, THE Tool_Docs_Service SHALL re-link that existing Docs_Page only if the Docs_Page is NOT already referenced by another Tool_Record's `docPageId`.
6. WHEN the orphaned-page search under Requirement 12 criterion 5 finds multiple unlinked matching Docs_Pages, THE Tool_Docs_Service SHALL select the most recently updated Docs_Page (by `updatedAt` timestamp).
7. WHEN the orphaned-page search under Requirement 12 criterion 5 finds no unlinked matching Docs_Page, THE Tool_Docs_Service SHALL create a new Docs_Page following the auto-creation rules in Requirement 3.
8. WHEN an existing Docs_Page is re-linked to a new Tool_Record, THE Tool_Docs_Service SHALL re-apply the Page_Lock, re-insert the Training_Link, and update the Description_Section with the current quiz description.

### Requirement 13: Published and Viewable Documentation Pages

**User Story:** As a makerspace member, I want auto-created tool docs pages to be published and visible, so that I can always view the documentation when I click a tool link from My Training.

#### Acceptance Criteria

1. WHEN a Docs_Page is auto-created for a Tool_Record, THE Tool_Docs_Service SHALL set the `isPublished` flag to 1 on the Docs_Page.
2. WHILE a Docs_Page has an active link to a Tool_Record, THE Tool_Docs_Service SHALL prevent editors from unpublishing the Docs_Page.
3. THE My_Training_Page SHALL only render a tool name as a clickable link when the linked Docs_Page has `isPublished` set to 1.
