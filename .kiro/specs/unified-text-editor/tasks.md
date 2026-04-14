# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Editor Bugs Across Toolbar, Image, Preview, Click Area, and Serialization
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist. Some tests will fail on unfixed code (confirming bugs), others serve as diagnostic baselines.
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: Tests that fail on unfixed code will validate the fix when they pass after implementation
  - Tests to write (all in a single test file, e.g. `packages/web/src/components/RichTextEditor.bugcondition.test.ts`):
    - **Toolbar command diagnostic test** (BASELINE — may pass on unfixed code): Create a Tiptap editor instance with the same extensions as `RichTextEditor`. For each toolbar command (`toggleHeading({level:1})`, `toggleHeading({level:2})`, `toggleHeading({level:3})`, `toggleBulletList`, `toggleOrderedList`, `setLink`, `insertTable`), call `editor.chain().focus().<command>.run()` and check the return value. This is a diagnostic to differentiate Hypothesis A (focus loss — commands work in isolation) from Hypothesis B (extension conflict — `.run()` returns `false`). Record results to guide the fix approach in task 3.
    - **Preview CSS test** (EXPECTED TO FAIL): Render the editor component, insert content with a table, image, and code block, then inspect the preview container for targeted CSS overrides — `<table>` should have borders and cell padding, `<img>` should have max-width, `<pre><code>` should have background styling. These are missing, confirming bug condition 1.7.
    - **Click area CSS test** (EXPECTED TO FAIL): Render the editor and verify `.ProseMirror` element has `min-height: 100%` and `cursor: text` styles — these are missing, confirming bug condition 1.8.
    - **Table size picker test** (EXPECTED TO FAIL): Render the editor and verify the Table toolbar button presents a size picker UI instead of directly calling `insertTable({ rows: 3, cols: 3 })` — currently hardcoded, confirming bug condition 1.4.
    - **toMarkdown supported-node baseline test** (BASELINE — expected to pass): Generate a `DocumentNode` with supported node types (heading, paragraph, bulletList, orderedList, bold, italic, link, inline image, codeBlock, blockquote, table, horizontalRule) and call `toMarkdown()` — verify it produces valid markdown without throwing. This confirms the baseline capability for supported types. Not a bug condition test per se, but establishes the contract for requirement 2.10.
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Preview CSS, click area, and table size picker tests FAIL. Toolbar diagnostic and toMarkdown baseline tests may PASS (they are diagnostic/baseline, not bug-condition tests).
  - Document results to guide implementation
  - Mark task complete when tests are written, run, and results are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 1.8, 1.10_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Bold, Italic, Draft Auto-Save, Draft Restore, ForwardRef Handle, InitialContent, CodeBlock
  - **IMPORTANT**: Follow observation-first methodology
  - Tests to write (in `packages/web/src/components/RichTextEditor.preservation.test.ts` and `packages/shared/src/markdown.preservation.property.test.ts`):
    - **Bold/Italic preservation**: Create a Tiptap editor with the same extensions. Select text, call `toggleBold().run()`, assert `editor.isActive('bold')` is true. Call again, assert it's false. Same for `toggleItalic()`. Observe on UNFIXED code — these should PASS (they work today).
    - **Auto-save preservation**: Create editor with `documentId="test-123"`. Type content. Verify `localStorage.getItem("hacmandocs_draft_test-123")` contains the updated JSON. Observe on UNFIXED code — should PASS.
    - **Draft restore preservation**: Set `localStorage.setItem("hacmandocs_draft_test-123", JSON.stringify(draftDoc))`. Create editor with `documentId="test-123"`. Verify editor content matches the draft. Observe on UNFIXED code — should PASS.
    - **clearDraft preservation**: Call `clearDraft()` via the imperative handle. Verify `localStorage.getItem("hacmandocs_draft_test-123")` is null. Observe on UNFIXED code — should PASS.
    - **forwardRef getJSON preservation**: Call `getJSON()` via the imperative handle. Verify it returns a valid `DocumentNode` matching editor content. Observe on UNFIXED code — should PASS.
    - **initialContent preservation**: Create editor with `initialContent` prop set to a specific `DocumentNode`. Verify editor content matches. Observe on UNFIXED code — should PASS.
    - **Code block toggle preservation**: Call `toggleCodeBlock().run()`. Assert `editor.isActive('codeBlock')` is true. Call again, assert false. Observe on UNFIXED code — should PASS.
    - **toMarkdown round-trip property test** (in `packages/shared/src/markdown.preservation.property.test.ts`): Generate schema-valid `DocumentNode` trees using only supported node types (heading, paragraph, bulletList, orderedList, bold, italic, link, inline image, codeBlock, blockquote, table, horizontalRule) with valid nesting and required attrs. Call `toMarkdown(doc)` and verify it does not throw. Call `parseMarkdown(toMarkdown(doc))` and verify the round-trip preserves structure for supported types. **Generator constraint**: Only produce schema-valid trees — valid parent/child nesting, required attrs present, recognized node types only.
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.10_

- [x] 3. Fix toolbar commands (H1/H2/H3, Lists, Link, Table)

  - [x] 3.1 Diagnose toolbar command failures
    - Add temporary `console.log` to each toolbar command to check `.run()` return value
    - If `.run()` returns `false` → Hypothesis B confirmed (extension not registered / StarterKit conflict). Fix extension config.
    - If `.run()` returns `true` but formatting doesn't appear → CSS/rendering issue. Investigate.
    - If `.run()` returns `true` and formatting appears intermittently → Hypothesis A confirmed (focus loss). Proceed with `onMouseDown` fix.
    - Remove diagnostic logging after root cause is identified
    - _Bug_Condition: isBugCondition(input) where input.action IN ['toggleHeading', 'toggleBulletList', 'toggleOrderedList', 'setLink', 'insertTable'] AND NOT formattingAppliedCorrectly(input)_
    - _Expected_Behavior: Toolbar commands apply formatting and editor.isActive() reflects the change_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Fix toolbar focus handling (if Hypothesis A confirmed)
    - Add `onMouseDown={(e) => e.preventDefault()}` to `ToolbarButton` component to prevent focus loss before the click handler fires
    - This prevents the browser from moving focus to the button before the Tiptap `editor.chain().focus()...run()` command executes
    - _Bug_Condition: ToolbarButton click steals focus from editor before command executes_
    - _Expected_Behavior: Toolbar buttons prevent default mousedown so editor retains focus during command execution_
    - _Preservation: Bold and Italic toolbar buttons must continue to work identically_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2_

  - [x] 3.3 Fix link insertion on empty selection
    - Current code (`addLink` callback) prompts for a URL and calls `editor.chain().focus().setLink({ href: url }).run()`, which does nothing useful if no text is selected — `setLink` applies a mark to the selection, and an empty selection has no text to mark
    - Fix: if the selection is empty (collapsed cursor), insert a text node with the URL as both the text content and the link href, e.g. `editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()`
    - If text is selected, continue to apply the link mark to the selection as before
    - **Verification test**: Write a test that creates an editor with a collapsed cursor (no selection), calls the link insertion logic with a URL, and asserts that a text node with the URL as content and a link mark is inserted. Also test the existing behavior: select text, insert link, assert the link mark is applied to the selected text.
    - _Bug_Condition: Link button does nothing when no text is selected_
    - _Expected_Behavior: Link button applies mark to selected text, or inserts a linked placeholder if no text is selected_
    - _Requirements: 2.3_

  - [x] 3.4 Implement table size picker UI
    - Replace hardcoded `insertTable({ rows: 3, cols: 3, withHeaderRow: true })` with a size picker component
    - Options: grid-based picker (hover to select dimensions) or simple row/column number inputs
    - User selects desired rows × columns, then table is inserted with those dimensions plus a header row
    - _Bug_Condition: Table button hardcodes 3×3 instead of letting user choose dimensions_
    - _Expected_Behavior: User can select table dimensions before insertion_
    - _Requirements: 2.4_

- [x] 4. Fix image paste and drop handlers
  - **IMPORTANT — Choose ONE async strategy and use it consistently across all three image insertion paths (paste, drop, toolbar upload).** Either:
    - **(A) Placeholder node**: Insert a lightweight placeholder (e.g., a paragraph with "Uploading image..." or a custom node) at the intended position immediately. Replace with the real image when upload completes. This preserves the user's intended position regardless of subsequent edits.
    - **(B) Insert at current cursor + loading indicator**: Insert the image at wherever the cursor is when the upload finishes, with a toast/spinner so the user knows an upload is in progress. Simpler but the image may land somewhere unexpected if the user kept typing.
  - **Pick one approach in 4.1 and use the same approach in 4.2 and 4.3.** Do not mix strategies — the editor should behave the same way regardless of how the image entered the document.

  - [x] 4.1 Replace raw ProseMirror API with Tiptap command API in handlePaste
    - Replace `view.state.schema.nodes.image.create({ src })` and `view.dispatch(tr.replaceSelectionWith(node))` with `editor.chain().focus().setImage({ src }).run()`
    - The `editor` instance is available in the closure — use it instead of `view`
    - Handle the async race condition using the approach chosen at the task 4 level
    - Ensure URL is fully resolved via `uploadImageFile` (which already resolves relative URLs)
    - **Verification test**: Write a test that mocks `uploadImageFile` to return a known URL, simulates a paste event with an image, and asserts that an image node with the correct absolute URL is present in the editor's document JSON after the async upload resolves.
    - _Bug_Condition: handlePaste uses raw ProseMirror view.dispatch() bypassing Tiptap state management_
    - _Expected_Behavior: Image pasted from clipboard is uploaded, URL resolved to absolute, and inserted via Tiptap setImage command_
    - _Preservation: Existing image upload to /api/images/upload with session token must continue_
    - _Requirements: 2.6, 3.6_

  - [x] 4.2 Replace raw ProseMirror API with Tiptap command API in handleDrop
    - Replace raw ProseMirror `view.state.schema.nodes.image.create()` and `view.dispatch(tr.insert())` with Tiptap command API
    - Capture drop position immediately via `editor.view.posAtCoords({ left: event.clientX, top: event.clientY })`
    - Handle async race using the approach chosen at the task 4 level
    - If `posAtCoords` returns null, fall back to inserting at current cursor position
    - **Verification test**: Write a test that mocks `uploadImageFile`, simulates a drop event, and asserts that an image node with the correct absolute URL is present in the editor's document JSON after the async upload resolves.
    - _Bug_Condition: handleDrop uses raw ProseMirror view.dispatch() bypassing Tiptap state management_
    - _Expected_Behavior: Dropped image is uploaded, URL resolved to absolute, and inserted at drop position via Tiptap command API_
    - _Preservation: Existing image upload to /api/images/upload with session token must continue_
    - _Requirements: 2.11, 3.6_

  - [x] 4.3 Fix toolbar image upload async race condition
    - The existing `insertImageFromFile` function in `Toolbar` has the same async race as paste/drop — cursor may move during upload
    - Use the same approach chosen at the task 4 level for consistency
    - Do NOT attempt to capture and map cursor positions across async boundaries — this is unreliable as documented in the design
    - **Verification test**: Write a test that mocks `uploadImageFile`, triggers the toolbar upload flow, and asserts that an image node with the correct absolute URL is present in the editor's document JSON after the async upload resolves.
    - _Bug_Condition: Toolbar upload may insert image at wrong position if user types during upload_
    - _Expected_Behavior: Image inserted at the position where the user initiated the upload (placeholder approach) or at current cursor with clear feedback (fallback approach)_
    - _Requirements: 2.5, 3.6_

- [x] 5. Fix image URL resolution
    - Verify `uploadImageFile` handles all API response formats correctly
    - Current logic: `url.startsWith("http") ? url : API_URL + url` — validate this covers edge cases (e.g., URL with leading slash, URL without leading slash, already-absolute URL)
    - Add test coverage for URL resolution edge cases
    - **Verification**: After fixing URL resolution, verify that resolved URLs render correctly in both the editor (image visible in the editing area) and the preview pane (image visible with proper styling). This can be a manual check or an automated test that inserts an image with a resolved URL and asserts the `<img>` element's `src` attribute matches the expected absolute URL in both the editor DOM and preview DOM.
    - _Bug_Condition: Stored image URL may not resolve to a full absolute URL_
    - _Expected_Behavior: All image URLs are fully resolved absolute URLs that render correctly in both editor and preview_
    - _Requirements: 2.5, 2.6, 2.11_

- [x] 6. Fix preview pane

  - [x] 6.1 Add targeted CSS overrides for Tiptap HTML output
    - Add CSS rules (via Tailwind `@layer` or scoped styles on the preview container) for elements that `@tailwindcss/typography` does not style by default:
      - `<table>`: border-collapse, cell borders (`border: 1px solid`), cell padding
      - `<img>`: `max-width: 100%`, `height: auto` for responsive images
      - `<pre><code>`: verify code block styling matches prose expectations; add background, font-family overrides if needed
    - These overrides apply to the preview `div.prose.prose-invert` container
    - **Verification**: After applying CSS, manually verify in the browser that:
      - A table in the preview has visible borders and cell padding (not just raw `<table>` with no styling)
      - An image in the preview is constrained to the container width (not overflowing)
      - A code block in the preview has a distinct background and monospace font
    - Class-level assertions alone are insufficient — the requirement is user-visible rendering correctness, not just correct class names
    - _Bug_Condition: Tiptap HTML output for tables, images, code blocks is unstyled in preview_
    - _Expected_Behavior: Preview renders all Tiptap HTML elements with proper, visually correct typography styling_
    - _Requirements: 2.7_

  - [x] 6.2 Verify preview reactivity (stale render check)
    - **VERIFY FIRST**: Check whether the preview actually fails to update as the user types
    - If the preview updates correctly (React re-renders on `editor.getHTML()` changes), no fix needed — skip this sub-task
    - If the preview is stale: store HTML in React state via `onUpdate` callback and use that state for `dangerouslySetInnerHTML`
    - Do NOT add unnecessary state management if the preview already works reactively
    - _Bug_Condition: Preview may not re-render on editor content changes (UNCONFIRMED)_
    - _Expected_Behavior: Preview updates reactively on every editor change_
    - _Requirements: 2.7_

- [x] 7. Fix editor click area
    - Add CSS to make `.ProseMirror` fill the container: `min-height: 100%; outline: none; cursor: text;`
    - Ensure the parent container (`div.min-h-[300px]`) uses `flex flex-col` or sets explicit height so `.ProseMirror` can expand
    - Alternatively, add `h-full` to the `EditorContent` wrapper and ensure `.ProseMirror` inherits it
    - _Bug_Condition: .ProseMirror element does not fill container height, leaving dead click zones below text_
    - _Expected_Behavior: Clicking anywhere in the editor container (including empty space below text) moves cursor to nearest valid position_
    - _Requirements: 2.8_

- [x] 8. Add quiz description editor

  - [x] 8.1 Refactor RichTextEditor to accept configurable extensions AND toolbar controls
    - **Prerequisite**: `RichTextEditor.tsx` currently hardcodes both its extensions AND its toolbar. The toolbar always renders image upload, ordered list, code block, and table buttons regardless of which extensions are active. Simply swapping extensions would leave dead/broken toolbar buttons visible.
    - **Step 1 — Configurable extensions**: Add an optional `extensions` prop to `RichTextEditor`. If provided, use the custom extensions; if not, use the current default set. This keeps backward compatibility for existing pages.
    - **Step 2 — Configurable toolbar**: The `Toolbar` component must adapt to the active extensions. Either:
      - (a) Derive toolbar buttons from the editor's registered extensions (check `editor.extensionManager` or `editor.can()` to determine which commands are available), or
      - (b) Accept a `toolbarConfig` prop that explicitly lists which toolbar groups to show (e.g., `{ headings: true, bold: true, italic: true, bulletList: true, orderedList: false, link: true, image: false, codeBlock: false, table: false }`)
    - Approach (a) is more robust — buttons only appear if the extension is registered. Approach (b) is simpler but requires manual sync between extensions and toolbar config.
    - **Verification**: When the quiz editor passes restricted extensions, the toolbar must NOT show image upload, ordered list, code block, or table buttons. Write a test that renders `RichTextEditor` with the restricted quiz extensions and asserts that the toolbar does not contain buttons for image upload, ordered list, code block, or table insertion.
    - _Preservation: Existing pages that use RichTextEditor without the new props must continue to render the full toolbar identically_
    - Then create `packages/web/src/pages/admin/EditQuizDescriptionPage.tsx`
    - Route: `/admin/quizzes/:id/description`
    - Hosts `RichTextEditor` with RESTRICTED extension set and matching toolbar:
      ```
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          codeBlock: false,
          orderedList: false,
        }),
        Link.configure({ openOnClick: false }),
        // NO Image, NO Table/TableRow/TableCell/TableHeader
      ]
      ```
    - On load: fetch quiz description (markdown string), convert to `DocumentNode` via `parseMarkdown()`
    - On save: convert editor JSON to markdown via `toMarkdown()`, PUT to quiz API endpoint
    - Include back-navigation to QuizzesPage
    - _Bug_Condition: Quiz descriptions have no rich text editor or dedicated edit page_
    - _Expected_Behavior: Dedicated editor page with restricted extensions AND matching toolbar for quiz descriptions_
    - _Preservation: Existing pages that use RichTextEditor without the extensions prop must continue to work identically_
    - _Requirements: 2.9, 3.7, 3.8_

  - [x] 8.2 Register route in App.tsx
    - Add route `/admin/quizzes/:id/description` under the admin layout in `App.tsx`
    - Import `EditQuizDescriptionPage` component
    - _Requirements: 2.9_

  - [x] 8.3 Replace textarea with editor link in QuizzesPage
    - In `QuizzesPage.tsx`, replace the description `<textarea>` fields (both in create and edit forms) with a link/button that navigates to `/admin/quizzes/:id/description`
    - For the create form: first create the quiz (POST), then navigate to the description editor for the new quiz ID
    - For the edit form: replace the textarea with a "Edit Description" button that navigates to the editor page
    - **CRITICAL**: Remove the old textarea path entirely so admins cannot bypass the restricted extension set
    - _Bug_Condition: Textarea allows unrestricted content that the quiz renderer cannot handle_
    - _Expected_Behavior: All quiz description editing goes through the restricted rich text editor_
    - _Requirements: 2.9_

  - [x] 8.4 Verify quiz editor output renders correctly in quiz taker view
    - Create a quiz description using the new restricted editor with representative content: a heading, bold/italic text, an unordered list, and a link
    - Save the description (which goes through `toMarkdown()`)
    - Load the quiz in the quiz taker view (`QuizTakingPage.tsx`) and verify the description renders correctly through the existing quiz renderer
    - **This is the integration check that closes the loop** — it proves the restricted editor output is compatible with the quiz renderer's narrow parser
    - If any construct doesn't render correctly, either fix the renderer or further restrict the editor
    - _Requirements: 2.9_

- [x] 9. Verify bug condition exploration tests now pass

  - [x] 9.1 Re-run bug condition exploration tests
    - **Property 1: Expected Behavior** - Editor Bugs Fixed
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - Previously failing tests (preview CSS, click area, table size picker) should now be green
    - Baseline/diagnostic tests (toolbar command diagnostic, toMarkdown baseline) should still behave as expected
    - This does NOT prove all bug conditions are fixed — it only confirms the subset covered by task 1 tests. Behaviors added in later tasks (link empty-selection, image paste/drop, quiz toolbar, etc.) have their own verification steps.
    - Run bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Previously failing tests PASS; baseline tests still behave as expected
    - _Requirements: 2.1, 2.2, 2.4, 2.7, 2.8, 2.10_

  - [x] 9.2 Re-run preservation tests
    - **Property 2: Preservation** - Existing Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (bold, italic, auto-save, draft restore, clearDraft, forwardRef, initialContent, code block, toMarkdown round-trip)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.10_

- [x] 10. Cleanup and final checkpoint
  - **Remove all temporary diagnostic instrumentation**: Remove any `console.log` statements, development-only helpers, or exploratory logging added during tasks 3.1, 6.2, or any other investigation step. Search for `console.log` in modified files and verify none are left from this bugfix work.
  - Run full test suite to verify no regressions
  - Verify all bug condition tests pass (task 1 tests now green)
  - Verify all preservation tests pass (task 2 tests still green)
  - Verify no TypeScript compilation errors (`pnpm typecheck` in packages/web and packages/shared)
  - Ensure all tests pass, ask the user if questions arise
