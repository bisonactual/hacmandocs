import { useEditor, EditorContent } from "@tiptap/react";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import type { DocumentNode } from "@hacmandocs/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
const DRAFT_PREFIX = "hacmandocs_draft_";

function getDraftKey(documentId: string): string {
  return `${DRAFT_PREFIX}${documentId}`;
}

export interface RichTextEditorHandle {
  getJSON: () => DocumentNode;
  clearDraft: () => void;
}

interface RichTextEditorProps {
  documentId: string;
  initialContent?: DocumentNode;
  onChange?: (content: DocumentNode) => void;
  /** Custom Tiptap extensions. If omitted, the full default set is used. */
  extensions?: Extensions;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      disabled={disabled}
      title={title}
      className={`rounded px-2 py-1 text-sm ${
        active
          ? "bg-hacman-yellow/20 text-hacman-yellow"
          : "text-gray-400 hover:bg-hacman-gray"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

async function uploadImageFile(file: File): Promise<string> {
  const token = localStorage.getItem("session_token");
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/api/images/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Upload failed (${res.status})`);
  }

  const { url } = (await res.json()) as { url: string };
  // Return full URL so it works in the editor preview
  return resolveImageUrl(url, API_URL);
}

/**
 * Resolve a potentially-relative image URL against the API base URL.
 * - Already-absolute URLs (http:// or https://) pass through unchanged.
 * - Relative URLs are joined to API_URL with a guaranteed slash separator.
 */
export function resolveImageUrl(url: string, apiBase: string): string {
  if (url.startsWith("http")) return url;
  const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  const relative = url.startsWith("/") ? url : `/${url}`;
  return `${base}${relative}`;
}

function TableSizePicker({
  editor,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
}) {
  const [open, setOpen] = useState(false);
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);
  const maxRows = 6;
  const maxCols = 6;

  return (
    <div className="relative">
      <ToolbarButton onClick={() => setOpen((o) => !o)} title="Insert table">
        ⊞ Table
      </ToolbarButton>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 rounded border border-hacman-gray bg-hacman-dark p-2 shadow-lg"
          onMouseLeave={() => {
            setHoverRow(0);
            setHoverCol(0);
          }}
        >
          <div className="mb-1 text-center text-xs text-gray-400">
            {hoverRow > 0 && hoverCol > 0
              ? `${hoverRow} × ${hoverCol}`
              : "Select size"}
          </div>
          <div className="grid grid-cols-6 gap-0.5">
            {Array.from({ length: maxRows }, (_, r) =>
              Array.from({ length: maxCols }, (_, c) => (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => {
                    setHoverRow(r + 1);
                    setHoverCol(c + 1);
                  }}
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .insertTable({
                        rows: r + 1,
                        cols: c + 1,
                        withHeaderRow: true,
                      })
                      .run();
                    setOpen(false);
                    setHoverRow(0);
                    setHoverCol(0);
                  }}
                  className={`h-4 w-4 rounded-sm border ${
                    r + 1 <= hoverRow && c + 1 <= hoverCol
                      ? "border-hacman-yellow bg-hacman-yellow/30"
                      : "border-gray-600 bg-hacman-gray/30"
                  }`}
                  aria-label={`${r + 1} rows by ${c + 1} columns`}
                />
              )),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({
  editor,
  isUploading: _isUploading,
  setIsUploading,
}: {
  editor: ReturnType<typeof useEditor>;
  isUploading: boolean;
  setIsUploading: (v: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const insertImageFromFile = async (file: File) => {
    setIsUploading(true);
    try {
      const src = await uploadImageFile(file);
      editor.chain().focus().setImage({ src }).run();
    } catch (err) {
      console.error("Image upload failed:", err);
      const url = window.prompt(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}\n\nEnter image URL manually:`);
      if (url) editor.chain().focus().setImage({ src: url }).run();
    } finally {
      setIsUploading(false);
    }
  };

  const addImage = useCallback(() => {
    // Open file picker; fall back to URL prompt if cancelled
    fileRef.current?.click();
  }, []);

  const addImageFromUrl = useCallback(() => {
    const url = window.prompt("Image URL:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const addLink = useCallback(() => {
    const url = window.prompt("Link URL:");
    if (url) {
      const { from, to } = editor.state.selection;
      if (from === to) {
        // Empty selection: insert the URL as linked text
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: url,
            marks: [{ type: "link", attrs: { href: url } }],
          })
          .run();
      } else {
        // Text is selected: apply link mark to selection
        editor.chain().focus().setLink({ href: url }).run();
      }
    }
  }, [editor]);

  // Derive which capabilities the editor supports from its registered extensions
  const hasImage = editor.extensionManager.extensions.some((e) => e.name === "image");
  const hasOrderedList = editor.extensionManager.extensions.some((e) => e.name === "orderedList");
  const hasCodeBlock = editor.extensionManager.extensions.some((e) => e.name === "codeBlock");
  const hasTable = editor.extensionManager.extensions.some((e) => e.name === "table");

  return (
    <div className="flex flex-wrap gap-1 border-b border-hacman-gray bg-hacman-gray/50 p-2">
      {/* Headings */}
      {([1, 2, 3] as const).map((level) => (
        <ToolbarButton
          key={level}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          active={editor.isActive("heading", { level })}
          title={`Heading ${level}`}
        >
          H{level}
        </ToolbarButton>
      ))}

      <span className="mx-1 border-l border-hacman-gray" />

      {/* Inline formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic"
      >
        <em>I</em>
      </ToolbarButton>

      <span className="mx-1 border-l border-hacman-gray" />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
      >
        • List
      </ToolbarButton>
      {hasOrderedList && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered list"
        >
          1. List
        </ToolbarButton>
      )}

      <span className="mx-1 border-l border-hacman-gray" />

      {/* Link & Image */}
      <ToolbarButton onClick={addLink} active={editor.isActive("link")} title="Add link">
        🔗 Link
      </ToolbarButton>
      {hasImage && (
        <>
          <ToolbarButton onClick={addImage} title="Upload image">
            🖼 Upload
          </ToolbarButton>
          <ToolbarButton onClick={addImageFromUrl} title="Image from URL">
            🌐 Image URL
          </ToolbarButton>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) insertImageFromFile(file);
              e.target.value = "";
            }}
          />
        </>
      )}

      {/* Code block */}
      {hasCodeBlock && (
        <>
          <span className="mx-1 border-l border-hacman-gray" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive("codeBlock")}
            title="Code block"
          >
            {"</>"}
          </ToolbarButton>
        </>
      )}

      {/* Table */}
      {hasTable && <TableSizePicker editor={editor} />}
    </div>
  );
}

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ documentId, initialContent, onChange, extensions: customExtensions }, ref) {
    // Try to restore draft from localStorage
    const savedDraft = (() => {
      try {
        const raw = localStorage.getItem(getDraftKey(documentId));
        return raw ? (JSON.parse(raw) as DocumentNode) : null;
      } catch {
        return null;
      }
    })();

    // Ref to hold the editor instance so async handlers (paste/drop) can access it
    const editorRef = useRef<ReturnType<typeof useEditor>>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [previewHtml, setPreviewHtml] = useState("");

    // Default extensions used when no custom set is provided
    const defaultExtensions: Extensions = [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: false, // Disable StarterKit's bundled Link to avoid duplicate; we register Link separately below
      }),
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ];

    const editor = useEditor({
      extensions: customExtensions ?? defaultExtensions,
      content: savedDraft ?? initialContent ?? { type: "doc", content: [{ type: "paragraph" }] },
      editorProps: {
        handlePaste: (_view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of items) {
            if (item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file) {
                setIsUploading(true);
                uploadImageFile(file).then((src) => {
                  const ed = editorRef.current;
                  if (ed) {
                    ed.chain().focus().setImage({ src }).run();
                  }
                }).catch((err) => {
                  console.error("Image paste upload failed:", err);
                }).finally(() => {
                  setIsUploading(false);
                });
                return true;
              }
            }
          }
          return false;
        },
        handleDrop: (view, event) => {
          const file = event.dataTransfer?.files[0];
          if (file?.type.startsWith("image/")) {
            event.preventDefault();
            // Capture drop position immediately before async upload
            const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY });
            setIsUploading(true);
            uploadImageFile(file).then((src) => {
              const ed = editorRef.current;
              if (ed) {
                // Move cursor to drop position (if available), then insert image
                if (dropPos) {
                  ed.chain().focus().setTextSelection(dropPos.pos).setImage({ src }).run();
                } else {
                  ed.chain().focus().setImage({ src }).run();
                }
              }
            }).catch((err) => {
              console.error("Image drop upload failed:", err);
            }).finally(() => {
              setIsUploading(false);
            });
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        const json = ed.getJSON() as DocumentNode;
        setPreviewHtml(ed.getHTML());
        // Persist draft to localStorage
        try {
          localStorage.setItem(getDraftKey(documentId), JSON.stringify(json));
        } catch {
          // Storage full — ignore
        }
        onChange?.(json);
      },
      onCreate: ({ editor: ed }) => {
        setPreviewHtml(ed.getHTML());
      },
    });

    // Keep editorRef in sync with the editor instance
    editorRef.current = editor;

    // If initialContent changes (e.g. loading from API), update editor
    useEffect(() => {
      if (editor && initialContent && !savedDraft) {
        editor.commands.setContent(initialContent);
      }
      // Only run when initialContent changes, not savedDraft
    }, [initialContent, editor]);

    useImperativeHandle(ref, () => ({
      getJSON: () => (editor?.getJSON() as DocumentNode) ?? { type: "doc", content: [] },
      clearDraft: () => {
        try {
          localStorage.removeItem(getDraftKey(documentId));
        } catch {
          // ignore
        }
      },
    }));

    if (!editor) return null;

    return (
      <div className="flex gap-4">
        {/* Editor pane */}
        <div className="flex-1 rounded-lg border border-hacman-gray bg-hacman-dark">
          <Toolbar editor={editor} isUploading={isUploading} setIsUploading={setIsUploading} />
          <div className="flex min-h-[300px] flex-col p-4 text-gray-200">
            {isUploading && (
              <div className="mb-2 flex items-center gap-2 rounded bg-hacman-gray/50 px-3 py-1.5 text-xs text-gray-400">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                Uploading image…
              </div>
            )}
            <EditorContent editor={editor} className="flex-1" />
          </div>
        </div>

        {/* Live preview pane */}
        <div className="flex-1 rounded-lg border border-hacman-gray bg-hacman-dark p-4">
          <h3 className="mb-2 text-sm font-semibold text-hacman-muted">Preview</h3>
          <div
            className="prose prose-invert max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
    );
  },
);

export default RichTextEditor;
