# Bugfix Requirements Document

## Introduction

The rich text editor (`RichTextEditor.tsx`) has multiple broken features that prevent users from authoring content effectively. The editor is built on Tiptap (ProseMirror) and is used across document creation and edit-proposal pages. Issues span toolbar functionality, image handling, live preview, click-target area, markdown output correctness, and editor availability (quiz descriptions currently have no editor page). All fixes must preserve existing bold/italic behaviour and the draft auto-save mechanism.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user clicks the H1, H2, or H3 toolbar button THEN the system does not apply a heading to the selected text

1.2 WHEN the user clicks the bullet list or ordered list toolbar button THEN the system does not toggle a list on the selected content

1.3 WHEN the user clicks the Link toolbar button and enters a URL THEN the system does not apply the link mark to the selected text

1.4 WHEN the user clicks the Table toolbar button THEN the system does not insert a table into the document

1.5 WHEN the user uploads an image via the toolbar file picker THEN the system inserts a broken/unresolvable image node because the stored URL is not resolved to a full absolute URL before insertion

1.6 WHEN the user pastes an image from the clipboard into the editor THEN the system fails to upload and insert the image because the paste handler manipulates ProseMirror view state directly instead of using the Tiptap command API, causing the insertion to be lost or corrupt

1.7 WHEN the user views the live preview pane THEN the preview does not update reactively as the user types, and Tiptap's HTML output for certain elements (tables, images, code blocks) is not properly styled by the existing `@tailwindcss/typography` configuration

1.8 WHEN the user clicks in an empty area of the editor container below existing text THEN the system does not move the cursor there because `EditorContent` does not fill the full container height, leaving dead click zones

1.9 WHEN the user edits a quiz description THEN the system provides only a plain text input field with no rich-text editor or dedicated edit page

1.10 WHEN the user attempts to export content as markdown via `toMarkdown()` THEN the converter silently drops or degrades certain valid node types (top-level images, admonitions, tableHeader distinction), producing incomplete markdown for documents that contain those constructs

1.11 WHEN the user drags and drops an image file onto the editor THEN the system fails to upload and insert the image because the drop handler manipulates ProseMirror view state directly instead of using the Tiptap command API, and the URL resolution may also be broken

### Expected Behavior (Correct)

2.1 WHEN the user clicks the H1, H2, or H3 toolbar button THEN the system SHALL apply the corresponding heading level to the current block, toggling it off if already active

2.2 WHEN the user clicks the bullet list or ordered list toolbar button THEN the system SHALL toggle the appropriate list type on the selected content

2.3 WHEN the user clicks the Link toolbar button and enters a URL THEN the system SHALL apply the link mark to the selected text (or insert a linked placeholder if no text is selected)

2.4 WHEN the user clicks the Table toolbar button THEN the system SHALL present a size picker (e.g. grid or row/column inputs) allowing the user to choose the number of rows and columns, and SHALL insert a table of the chosen dimensions with a header row at the cursor position

2.5 WHEN the user uploads an image via the toolbar file picker THEN the system SHALL resolve the returned URL to a full absolute URL and insert a valid image node that renders correctly in the editor and preview

2.6 WHEN the user pastes an image from the clipboard into the editor THEN the system SHALL upload the image file, obtain a full absolute URL, and insert the image node using the Tiptap command API so it appears correctly in the document

2.7 WHEN the user views the live preview pane THEN the system SHALL re-render the preview on every editor update so it stays in sync with the editor content, using Tiptap's `editor.getHTML()` with proper prose CSS styling. The preview must update reactively (not just on initial render) and must style Tiptap's HTML output for tables (borders, cell padding), images (max-width, responsive), and code blocks (background, font) which `@tailwindcss/typography` does not cover by default.

2.8 WHEN the user clicks anywhere inside the editor container THEN the system SHALL move the cursor to the nearest valid position, including empty space below existing content, by ensuring `EditorContent` fills the full container height

2.9 WHEN the user edits a quiz description THEN the system SHALL provide a dedicated editor page (route) that hosts the rich-text editor, allowing the user to author and save the description as markdown-compliant content

2.10 WHEN the editor serialises content for storage or export THEN the system SHALL be capable of producing valid markdown on demand via the shared `toMarkdown` utility for the subset of node types the converter currently supports (headings, paragraphs, lists, bold, italic, links, inline images, code blocks, blockquotes, tables, horizontal rules), while continuing to use DocumentNode JSON as the primary storage and transport format. Known converter gaps — top-level image nodes, admonition nodes, and tableHeader vs tableCell distinction — are out of scope for this bugfix and will not produce correct markdown output.

2.11 WHEN the user drags and drops an image file onto the editor THEN the system SHALL upload the image file, obtain a full absolute URL, and insert the image node at the drop position using the Tiptap command API so it appears correctly in the document

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user clicks the Bold toolbar button THEN the system SHALL CONTINUE TO toggle bold formatting on the selected text

3.2 WHEN the user clicks the Italic toolbar button THEN the system SHALL CONTINUE TO toggle italic formatting on the selected text

3.3 WHEN the user types in the editor THEN the system SHALL CONTINUE TO auto-save a draft to localStorage keyed by `documentId`

3.4 WHEN the editor is initialised with a saved draft in localStorage THEN the system SHALL CONTINUE TO restore that draft as the initial content

3.5 WHEN the user submits a document or proposal THEN the system SHALL CONTINUE TO call `clearDraft()` to remove the localStorage draft entry

3.6 WHEN the user uploads an image via the toolbar on a page that already works THEN the system SHALL CONTINUE TO upload the file to `/api/images/upload` using the session token and insert the result

3.7 WHEN the editor is used on the Create Document page THEN the system SHALL CONTINUE TO expose the `getJSON` / `clearDraft` imperative handle via `forwardRef`

3.8 WHEN the editor is used on the Propose Edit page THEN the system SHALL CONTINUE TO accept and display `initialContent` passed as a prop

3.9 ~~WHEN the user drags and drops an image file onto the editor THEN the system SHALL CONTINUE TO upload and insert the image at the drop position~~ (MOVED — drag-and-drop is currently broken; see 1.11 / 2.11)

3.10 WHEN the user inserts a code block via the toolbar THEN the system SHALL CONTINUE TO toggle a fenced code block on the selected content
