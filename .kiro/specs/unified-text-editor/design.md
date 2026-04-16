# Unified Text Editor Bugfix Design

## Overview

The `RichTextEditor.tsx` component has 11 distinct bugs spanning toolbar commands, image handling, preview styling, click-target area, on-demand markdown export, and missing quiz description editor support. After evaluating the tech stack (see below), the recommendation is to keep Tiptap and fix the implementation bugs — the issues are all in our code, not in Tiptap itself.

### Tech Stack Evaluation

The user asked whether to keep Tiptap or switch to a different editor library. Here is the analysis:

**Option 1: Keep Tiptap (ProseMirror wrapper) — RECOMMENDED**

The broken features (headings, lists, links, tables, images, preview, click area) are all implementation bugs in `RichTextEditor.tsx`, not Tiptap limitations:
- Toolbar commands use the correct Tiptap API (`toggleHeading`, `toggleBulletList`, `setLink`, `insertTable`) — if they're not working, it's likely a rendering/CSS issue or the editor instance isn't properly focused, not a Tiptap deficiency.
- Image paste/drop handlers bypass Tiptap's command API and use raw ProseMirror `view.dispatch()` — this is our code's fault, not Tiptap's.
- Preview uses `editor.getHTML()` which is actually the correct approach — the issue is missing prose CSS styling, not the rendering pipeline.
- Click area is a CSS issue (`EditorContent` not filling the container).

Tiptap advantages for this project:
- Already installed and integrated (v3.22.3)
- Content stored as ProseMirror JSON (`DocumentNode` type) — switching would require a data migration
- The shared `markdown.ts` already converts between ProseMirror JSON and markdown via MDAST
- Rich extension ecosystem (StarterKit, Link, Image, Table all already installed)
- Strong React integration via `@tiptap/react`

**Option 2: Switch to Milkdown (markdown-native ProseMirror wrapper)**

Milkdown is markdown-first, which aligns with the app's need for markdown output. However:
- Would require rewriting the entire editor component
- Would require migrating the `DocumentNode` storage format or adding a conversion layer
- The shared `markdown.ts` utilities would need reworking
- Milkdown's ecosystem is smaller and less mature than Tiptap's
- The bugs we're seeing would likely still occur (they're implementation bugs, not framework bugs)

**Option 3: Switch to CodeMirror (pure markdown editor)**

- Loses WYSIWYG editing — users would edit raw markdown
- Poor UX for non-technical users (this is a hackspace documentation portal)
- Would require completely different content rendering approach

**Option 4: Switch to MDXEditor or react-markdown-editor-lite**

- MDXEditor is MDX-focused, overkill for this use case
- react-markdown-editor-lite is unmaintained (last release 2022)
- Neither has the extension ecosystem Tiptap provides

**Verdict**: Keep Tiptap. The bugs are in our implementation, not the framework. Switching would introduce migration risk and delay for no architectural benefit.

## Glossary

- **Bug_Condition (C)**: The set of conditions under which the editor produces incorrect behavior — toolbar commands failing, image URLs broken, preview lacking proper prose CSS styling, dead click zones, missing quiz editor, and `toMarkdown()` not callable on demand
- **Property (P)**: The desired behavior — toolbar commands apply formatting, images resolve correctly, preview renders `getHTML()` output with proper prose CSS, full click area, quiz editor available, and markdown is producible on demand via `toMarkdown()` while DocumentNode JSON remains the primary storage format
- **Preservation**: Existing bold/italic formatting, auto-save drafts, draft restoration, clearDraft on submit, forwardRef handle, initialContent prop, and code block toggle must remain unchanged
- **`RichTextEditor`**: The React component in `packages/web/src/components/RichTextEditor.tsx` wrapping Tiptap
- **`markdown.ts`**: The shared conversion utilities in `packages/shared/src/markdown.ts` providing `parseMarkdown` and `toMarkdown`
- **`DocumentNode`**: The ProseMirror-compatible JSON type defined in `packages/shared/src/types.ts`

## Bug Details

### Bug Condition

The bugs manifest across several categories of editor interaction. The toolbar commands (headings, lists, links, tables) fail to apply formatting. Image operations (upload, paste, drop) produce broken nodes or use the wrong API. The preview pane uses `getHTML()` correctly but lacks proper prose CSS styling. The editor click area has dead zones. Quiz descriptions lack a rich text editor. The `toMarkdown()` utility should be callable on demand without errors.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type EditorInteraction
  OUTPUT: boolean

  RETURN (input.action IN ['toggleHeading', 'toggleBulletList', 'toggleOrderedList', 'setLink', 'insertTable']
          AND NOT formattingAppliedCorrectly(input))
         OR (input.action IN ['uploadImage', 'pasteImage', 'dropImage']
             AND (NOT imageNodeInsertedCorrectly(input) OR NOT imageUrlResolved(input)))
         OR (input.action == 'viewPreview'
             AND NOT previewRenderedWithProperProseCSS(input))
         OR (input.action == 'clickEmptyArea'
             AND NOT cursorMovedToNearestPosition(input))
         OR (input.action == 'editQuizDescription'
             AND NOT richTextEditorAvailable(input))
         OR (input.action == 'exportMarkdown'
             AND NOT toMarkdownProducesValidOutputOnDemand(input))
END FUNCTION
```

### Examples

- User clicks H1 button → heading level 1 is NOT applied to the current block (expected: heading toggles on)
- User clicks "• List" button → bullet list is NOT created (expected: list wraps selected content)
- User pastes an image from clipboard → image node is inserted via raw ProseMirror `view.dispatch()` which may corrupt state (expected: image inserted via Tiptap `setImage` command)
- User uploads image via toolbar → returned URL `/api/images/abc.png` is inserted without resolving to absolute URL (expected: `http://localhost:8787/api/images/abc.png`)
- User views preview pane → sees unstyled HTML output because prose CSS classes lack full typography coverage (expected: `getHTML()` output rendered with proper `prose prose-invert` Tailwind typography styling for headings, lists, tables, images, code blocks)
- User clicks below existing text in editor → cursor does not move because `.ProseMirror` element doesn't fill container height (expected: cursor moves to end of document)
- User edits quiz description → only a plain `<textarea>` is available (expected: rich text editor with toolbar)
- User saves document → DocumentNode JSON is stored directly (this is correct and unchanged); `toMarkdown()` should be callable on demand for export without errors, but persistence stays on JSON

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Bold toolbar button must continue to toggle bold formatting on selected text (3.1)
- Italic toolbar button must continue to toggle italic formatting on selected text (3.2)
- Auto-save to localStorage keyed by `documentId` must continue on every editor update (3.3)
- Draft restoration from localStorage on editor initialization must continue (3.4)
- `clearDraft()` must continue to remove the localStorage entry on submit (3.5)
- Image upload to `/api/images/upload` with session token must continue (3.6)
- `forwardRef` imperative handle exposing `getJSON`/`clearDraft` must continue (3.7)
- `initialContent` prop must continue to populate the editor on ProposeEditPage (3.8)
- Code block toggle must continue to work (3.10)

**Scope:**
All inputs that do NOT involve the broken features (headings, lists, links, tables, image paste/drop, preview, click area, quiz editor, serialization) should be completely unaffected by this fix. This includes:
- Bold and italic formatting
- Code block toggling
- Draft auto-save and restoration
- The `forwardRef` imperative handle API
- The `initialContent` prop behavior

## Hypothesized Root Cause

Based on code analysis of `RichTextEditor.tsx`:

1. **Toolbar Commands (H1/H2/H3, Lists, Link, Table)**: The Tiptap command API calls look correct (`toggleHeading`, `toggleBulletList`, `setLink`, `insertTable`).

   **Hypothesis A: Focus loss.** The editor instance may lose focus when toolbar buttons are clicked. The `ToolbarButton` component uses `type="button"` which prevents form submission but the default `mousedown` event still moves focus to the button before the `click` fires. Every toolbar command already calls `editor.chain().focus()...run()` which should re-focus, but if the selection is cleared by the focus loss, the command may target the wrong position or no-op.

   **Hypothesis B: Extension registration or StarterKit conflict.** The issue may instead be in extension configuration — e.g., StarterKit bundling its own heading/list extensions that conflict with separately registered ones, or an extension not being properly registered so `.run()` returns `false`.

   **Diagnostic step (MUST run before committing to either hypothesis):** Add temporary logging to each toolbar command: `const result = editor.chain().focus().toggleHeading({ level: 1 }).run(); console.log('toggleHeading result:', result);`. Check:
   - If `.run()` returns `false` → Hypothesis B confirmed (extension not registered / command not available). Investigate StarterKit config.
   - If `.run()` returns `true` but formatting doesn't appear → Investigate CSS/rendering.
   - If `.run()` returns `true` and formatting appears only intermittently → Hypothesis A likely (focus race condition). Proceed with `onMouseDown` fix.

2. **Image Paste/Drop Handlers (1.6, 1.11)**: The `handlePaste` and `handleDrop` callbacks in `editorProps` use raw ProseMirror API (`view.state.schema.nodes.image.create()`, `view.dispatch(tr.replaceSelectionWith(node))`) instead of the Tiptap command API (`editor.chain().focus().setImage({ src }).run()`). This bypasses Tiptap's state management and can cause the insertion to be lost or corrupt the document state. The `editor` instance is available in the closure but not used.

3. **Image URL Resolution (1.5)**: The `uploadImageFile` function already resolves relative URLs to absolute. However, the API may return a URL format that doesn't match the expected pattern. Need to verify the actual API response.

4. **Preview Rendering (1.7)**: The preview uses `dangerouslySetInnerHTML={{ __html: editor.getHTML() }}` which outputs Tiptap's internal HTML representation. There are two likely failure modes:

   **Possible failure mode 1: Stale preview (unconfirmed — verify before implementing).** The preview div renders `editor.getHTML()` but may not re-render on editor updates. This is theoretically possible because React may not detect changes to the `dangerouslySetInnerHTML` string between renders. However, this has not been observed and may not actually be a problem — Tiptap's `useEditor` hook may already trigger re-renders on content changes. Verify whether the preview actually fails to update before adding any state plumbing. Do not implement a fix for this unless the problem is confirmed.

   **Failure mode 2: Unstyled Tiptap HTML elements.** The code already has `prose prose-invert max-w-none` classes and `@tailwindcss/typography` is in the dependencies. However, Tiptap's HTML output for certain elements doesn't match what the typography plugin expects:
   - `<table>` elements: no borders or cell padding by default in prose
   - `<img>` elements: may overflow container without max-width
   - Code blocks: Tiptap may output `<pre><code>` structures that don't match prose's expected selectors
   
   These need targeted CSS overrides beyond the base prose classes.

   **Why not use the markdown pipeline for preview?** The `toMarkdown()` converter has known gaps (drops top-level images, loses admonitions, conflates tableHeader/tableCell). Using `getHTML()` with proper styling gives users an accurate WYSIWYG preview without content loss. The markdown converter gaps are flagged as separate future work — do NOT fix them in this bugfix.

5. **Click Area (1.8)**: The `EditorContent` component is inside `<div className="min-h-[300px] p-4 text-gray-200">` but the `.ProseMirror` element rendered by Tiptap doesn't inherit `min-height: 100%`. Adding CSS to make `.ProseMirror` fill its container and setting `cursor: text` will fix the dead zones.

6. **Quiz Description Editor (1.9)**: The `QuizzesPage.tsx` uses a plain `<textarea>` for the description field. A dedicated route (e.g., `/admin/quizzes/:id/description`) hosting the `RichTextEditor` component is needed, with the description stored as markdown-compliant content. **Critical constraint:** The quiz description Tiptap instance MUST use a RESTRICTED extension set — configure with ONLY the following extensions:
   - `StarterKit` with: headings enabled, bold enabled, italic enabled, **bullet lists enabled**, **ordered lists DISABLED** (`orderedList: false`), **code blocks DISABLED** (`codeBlock: false`)
   - `Link` extension
   - **EXCLUDE**: `Image` (toMarkdown() drops top-level image nodes — images would be lost on save), `Table`, `TableRow`, `TableCell`, `TableHeader`, and any admonition extensions
   
   **Rationale:** The quiz taker view uses a narrow custom parser tuned for Google Forms imports, not the full document renderer. Only headings, bold, italic, unordered lists, and links are supported. Ordered lists are excluded because the quiz renderer only recognizes `^[-*]\s+` syntax and does not parse numbered lists. Images are excluded because the quiz editor saves via `toMarkdown()` and the shared converter drops top-level image nodes — a quiz admin could insert an image, save, and lose it during JSON → markdown conversion. If image or ordered list support is needed later, fix the converter and renderer first.

7. **Serialization / Storage (1.10)**: The app stores and transports `DocumentNode` JSON end-to-end: `CreateDocumentPage` posts `contentJson`, `ProposeEditPage` posts `proposedContentJson`, worker routes validate and persist JSON payloads directly. **This is correct and MUST NOT change.** The persistence layer stays on DocumentNode JSON — no serialization round-trip changes. The fix is only to ensure `toMarkdown()` can be called on demand (for markdown download/export) without errors. No changes to `CreateDocumentPage.tsx` or `ProposeEditPage.tsx` submission logic. The known converter gaps (top-level images, admonitions, tableHeader) are flagged as separate future work.

## Correctness Properties

Property 1: Bug Condition - Toolbar Commands Apply Formatting

_For any_ editor state where the user invokes a toolbar command (heading, list, link, table), the fixed `RichTextEditor` SHALL apply the corresponding formatting to the editor content, and the editor state SHALL reflect the applied formatting (e.g., `editor.isActive('heading', { level: 1 })` returns true after toggling H1).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Bug Condition - Image Operations Insert Valid Nodes

_For any_ image operation (upload, paste, drop) where the upload succeeds, the fixed `RichTextEditor` SHALL insert an image node with a fully-resolved absolute URL using the Tiptap command API, and the image SHALL render correctly in both the editor and preview.

**Validates: Requirements 2.5, 2.6, 2.11**

Property 3: Bug Condition - Preview Renders Accurately and Reactively

_For any_ editor content, the fixed preview pane SHALL render with proper Tailwind prose CSS styling so Tiptap's HTML output displays correctly for all element types. Two areas to address:
1. **Unstyled Tiptap HTML elements (confirmed)**: `@tailwindcss/typography` does not style all Tiptap HTML output by default. Specifically: `<table>` elements lack borders and cell padding, `<img>` elements lack max-width/responsive sizing, and Tiptap's code block HTML may not match the prose plugin's expected structure. These need targeted CSS overrides.
2. **Stale preview (unconfirmed)**: If the preview is found to not update reactively as the user types, the HTML should be stored in React state to trigger re-renders. Verify before implementing.

**Validates: Requirements 2.7**

Property 4: Bug Condition - Full Click Area Coverage

_For any_ click inside the editor container (including empty space below existing text), the fixed `RichTextEditor` SHALL move the cursor to the nearest valid position by ensuring the ProseMirror element fills the full container height.

**Validates: Requirements 2.8**

Property 5: Bug Condition - On-Demand Markdown Production

_For any_ document content produced by the editor that uses only the supported node types (headings, paragraphs, lists, bold, italic, links, inline images, code blocks, blockquotes, tables, horizontal rules), calling `toMarkdown()` on the editor's DocumentNode JSON SHALL produce valid markdown without errors. DocumentNode JSON remains the primary storage and transport format — no changes to CreateDocumentPage or ProposeEditPage persistence logic. Known converter gaps — top-level image nodes, admonition nodes, and tableHeader vs tableCell distinction — are explicitly out of scope for this bugfix and will produce degraded or missing markdown output.

**Validates: Requirements 2.10**

Property 6: Preservation - Existing Formatting and Draft Behavior

_For any_ input that exercises bold, italic, code block formatting, auto-save drafts, draft restoration, clearDraft, forwardRef handle, or initialContent prop, the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.10**

## Fix Implementation

### Changes Required

**File**: `packages/web/src/components/RichTextEditor.tsx`

**Specific Changes**:

1. **Toolbar Focus Handling**: Ensure toolbar buttons don't steal focus from the editor. Add `onMouseDown={(e) => e.preventDefault()}` to `ToolbarButton` to prevent focus loss before the command executes.

   **Diagnostic step:** Before committing to either hypothesis, verify whether `.run()` returns `false` (meaning the command isn't available — points to Hypothesis B) or `true` (meaning the command executed — points to a focus or rendering issue). This can be done during development; it's not part of the final implementation.
   
   Only proceed with the `onMouseDown` fix if Hypothesis A is confirmed. If Hypothesis B, fix extension registration instead.

2. **Image Paste Handler**: Replace raw ProseMirror API usage in `handlePaste` with Tiptap command API. The async upload creates a race condition: if the user continues typing during upload, the image may land in the wrong place.

   **Recommended approach — placeholder node:** Insert a lightweight placeholder node (e.g., a paragraph with "Uploading image..." text or a custom node) at the current cursor position immediately when the paste is detected. When the upload completes, find and replace the placeholder with the real image node. This guarantees the image lands where the user intended regardless of subsequent edits.

   **Simpler fallback (if placeholder is too complex for this bugfix):** Insert at the current cursor position when the upload completes. This is what the toolbar upload already does and is predictable — the user sees the image appear at their cursor. Add a brief loading indicator (e.g., toolbar spinner or toast) so the user knows an upload is in progress.

   **Do NOT use `editor.view.state.tr.mapping.map()`** to try to track the original position — that mapping only reflects the current transaction, not the full history of edits that occurred during the upload. It will silently produce wrong positions after multiple edits.

3. **Image Drop Handler**: Same async race fix as paste handler — use a placeholder node at the drop position.

   **Drop position handling (explicit):**
   1. Capture `event.clientX` and `event.clientY` from the drop event
   2. Call `editor.view.posAtCoords({ left: event.clientX, top: event.clientY })` to resolve the ProseMirror document position immediately
   3. Insert a placeholder node at the resolved position
   4. Start the async upload
   5. When upload completes, find and replace the placeholder with the real image node
   6. If `posAtCoords` returned null, fall back to inserting at the current cursor position

   **Simpler fallback:** Same as paste — insert at current cursor when upload completes, with a loading indicator. Do NOT use `tr.mapping.map()` for position tracking across async boundaries.

4. **Image URL Resolution and Toolbar Upload Race**: Verify the `uploadImageFile` function's URL resolution logic handles all API response formats. The existing logic (`url.startsWith("http") ? url : API_URL + url`) looks correct but should be validated. The toolbar's `insertImageFromFile` function has the same async race condition as paste/drop — it should capture the cursor position before starting the upload and use the mapped position for insertion.

5. **Preview Pane Fix**: Two changes needed:

   **A. Reactive re-rendering (verify first — may not be needed):** The current preview renders `editor.getHTML()` inline. It's possible React doesn't re-render the `dangerouslySetInnerHTML` div on content changes, but this is unconfirmed. Check whether the preview actually fails to update before adding state plumbing. If it does fail:
   ```typescript
   const [previewHtml, setPreviewHtml] = useState('');
   // In onUpdate callback:
   onUpdate: ({ editor: ed }) => {
     setPreviewHtml(ed.getHTML());
     // ... existing draft save logic
   }
   ```
   Only implement this if the stale render is confirmed. Do not add unnecessary state management.

   **B. Targeted CSS overrides for Tiptap HTML:** The existing `prose prose-invert max-w-none` classes handle most elements, but Tiptap's HTML output for these elements needs additional styling:
   - `<table>`: Add border-collapse, cell borders, cell padding
   - `<img>`: Add max-width: 100%, height: auto for responsive images
   - `<pre><code>`: Verify code block styling matches prose expectations
   
   Add these as a Tailwind `@layer` or inline styles on the preview container.

6. **Click Area CSS**: Add CSS to make `.ProseMirror` fill the container:
   ```css
   .ProseMirror { min-height: 100%; outline: none; cursor: text; }
   ```
   And ensure the parent container uses `flex` or sets explicit height so the ProseMirror element can expand.

7. **Table Size Picker (2.4)**: The current implementation hardcodes 3×3. Add a simple size picker UI (grid or row/column inputs) that lets the user choose dimensions before inserting.

**File**: `packages/web/src/pages/admin/QuizzesPage.tsx` (and new route)

8. **Quiz Description Editor Page**: Create a new page component (e.g., `EditQuizDescriptionPage.tsx`) at route `/admin/quizzes/:id/description` that hosts the `RichTextEditor` for editing quiz descriptions. The description will be stored as markdown text in the existing `description` column (text type, no schema change needed). On save, convert ProseMirror JSON → markdown via `toMarkdown()`. On load, convert markdown → ProseMirror JSON via `parseMarkdown()`.

   **Critical: Remove old textarea path.** The existing `QuizzesPage.tsx` has direct textarea fields for quiz descriptions (in both create and edit forms). These MUST be replaced with a link/button that navigates to the new editor page. If the textareas remain live, admins can bypass the restricted extension set and enter content the quiz renderer can't handle, defeating the purpose of the constrained editor.

   **Critical: RESTRICTED Tiptap extension set for quiz descriptions:**
   ```typescript
   extensions: [
     StarterKit.configure({
       heading: { levels: [1, 2, 3] },
       codeBlock: false,    // DISABLED — quiz renderer cannot handle code blocks
       orderedList: false,  // DISABLED — quiz renderer only recognizes unordered list syntax (^[-*]\s+)
     }),
     Link.configure({ openOnClick: false }),
     // NO Image — toMarkdown() drops top-level image nodes, images would be lost on save
     // NO Table, TableRow, TableCell, TableHeader
     // NO admonition extensions
   ]
   ```
   
   **Rationale:** The quiz taker view uses a narrow custom parser tuned for Google Forms imports. Only headings, bold, italic, unordered lists, and links are supported. Ordered lists are excluded because the quiz renderer only recognizes `^[-*]\s+` syntax. Images are excluded because the quiz editor saves via `toMarkdown()` and the shared converter drops top-level image nodes — images would be lost during JSON → markdown conversion.

**File**: `packages/web/src/pages/CreateDocumentPage.tsx` and `ProposeEditPage.tsx`

9. **No Serialization/Persistence Changes**: These pages currently post `DocumentNode` JSON (`contentJson`, `proposedContentJson`) to the API, and the worker routes validate and persist JSON payloads directly. **This is correct and MUST NOT change.** DocumentNode JSON is the storage and transport format end-to-end. The `toMarkdown()` pipeline is ONLY for on-demand export (e.g., markdown download). No serialization round-trip changes to these files. No markdown conversion in the save path.

**File**: `packages/web/src/App.tsx`

10. **Route Registration**: Add the new quiz description editor route under the admin layout.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis (especially the focus-loss hypothesis for toolbar commands). If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate toolbar interactions, image operations, and preview rendering against the unfixed `RichTextEditor` component. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Toolbar Diagnostic Test**: Verify whether `.run()` returns `true` (command executed) or `false` (command not available) for each toolbar command. This differentiates Hypothesis A (focus loss) from Hypothesis B (extension/StarterKit conflict). (will fail on unfixed code)
2. **Image Paste Test**: Simulate pasting an image and verify the inserted node has a valid absolute URL (will fail on unfixed code due to raw ProseMirror API usage)
3. **Preview Styling Test**: Check that the preview pane container has proper `prose prose-invert` Tailwind typography classes and that headings, lists, tables, images render with correct styling (will fail on unfixed code if styling is incomplete)
4. **Click Area Test**: Verify that clicking below text moves the cursor (will fail on unfixed code due to CSS)

**Expected Counterexamples**:
- Toolbar commands: either `.run()` returns `false` (Hypothesis B — extension issue) or focus is lost before command executes (Hypothesis A — focus race). The diagnostic step distinguishes these.
- Image paste inserts a node but the document state may be inconsistent due to bypassing Tiptap's transaction management
- Preview renders HTML but without proper typography styling, headings/lists/tables appear unstyled

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := RichTextEditor_fixed(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT RichTextEditor_original(input) = RichTextEditor_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for bold/italic formatting, auto-save, draft restoration, and code block toggling, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Bold/Italic Preservation**: Verify toggling bold and italic continues to work identically after the fix
2. **Auto-Save Preservation**: Verify that editor updates still trigger localStorage writes with the correct key
3. **Draft Restoration Preservation**: Verify that initializing the editor with a saved draft still works
4. **ForwardRef Handle Preservation**: Verify that `getJSON()` and `clearDraft()` continue to work via the imperative handle
5. **InitialContent Preservation**: Verify that passing `initialContent` prop still populates the editor

### Unit Tests

- Test each toolbar command (H1, H2, H3, bullet list, ordered list, link, table) applies formatting correctly (with diagnostic logging to verify `.run()` return value)
- Test image upload URL resolution for various API response formats
- Test preview container has correct prose styling classes
- Test click area fills container (CSS assertion)
- Test quiz description editor loads and saves markdown correctly
- Test quiz description editor only allows restricted extensions (no tables, no code blocks)

### Property-Based Tests

- Generate schema-valid `DocumentNode` trees (valid nesting, required attrs, only valid node types) and verify `toMarkdown(doc)` produces valid markdown without errors (on-demand markdown production)
- Generate schema-valid `DocumentNode` trees and verify `toMarkdown(doc)` → `parseMarkdown(md)` round-trip preserves structure for supported node types (markdown converter round-trip fidelity)
- Generate random valid image URLs and verify URL resolution produces valid absolute URLs
- **Generator constraint (CRITICAL)**: All DocumentNode generators MUST produce only schema-valid trees — valid parent/child nesting (e.g., `listItem` only inside `bulletList`/`orderedList`, `tableRow` only inside `table`, `tableCell`/`tableHeader` only inside `tableRow`), required attrs present (e.g., `heading` has `level` 1-6), and only recognized node types. Invalid trees produce meaningless test failures and waste test budget.
- **Dropped — click-area PBT**: jsdom has no real layout engine, so coordinate-based click testing is unreliable in unit/property tests. Click-area verification is manual/e2e only.
- **Dropped — toolbar click-area PBT**: Toolbar command testing requires a real browser environment. Use unit tests with mocked editor instances instead.

### Integration Tests

- Test full document creation flow: type content → use toolbar → save → reload → verify DocumentNode JSON preserved (no markdown round-trip in persistence)
- Test propose-edit flow: load existing document → edit → submit → verify proposal DocumentNode JSON content
- Test quiz description flow: navigate to editor → type content (restricted extensions only) → save → verify markdown stored correctly
- Test preview pane updates in real-time as user types and renders with proper typography styling
