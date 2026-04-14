import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from "react";
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
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const insertImageFromFile = async (file: File) => {
    try {
      const src = await uploadImageFile(file);
      editor.chain().focus().setImage({ src }).run();
    } catch (err) {
      console.error("Image upload failed:", err);
      const url = window.prompt(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}\n\nEnter image URL manually:`);
      if (url) editor.chain().focus().setImage({ src: url }).run();
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
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

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
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Ordered list"
      >
        1. List
      </ToolbarButton>

      <span className="mx-1 border-l border-hacman-gray" />

      {/* Link & Image */}
      <ToolbarButton onClick={addLink} active={editor.isActive("link")} title="Add link">
        🔗 Link
      </ToolbarButton>
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

      <span className="mx-1 border-l border-hacman-gray" />

      {/* Code block */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        title="Code block"
      >
        {"</>"}
      </ToolbarButton>

      {/* Table */}
      <ToolbarButton
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        title="Insert table"
      >
        ⊞ Table
      </ToolbarButton>
    </div>
  );
}

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ documentId, initialContent, onChange }, ref) {
    // Try to restore draft from localStorage
    const savedDraft = (() => {
      try {
        const raw = localStorage.getItem(getDraftKey(documentId));
        return raw ? (JSON.parse(raw) as DocumentNode) : null;
      } catch {
        return null;
      }
    })();

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
        }),
        Link.configure({ openOnClick: false }),
        Image,
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
      ],
      content: savedDraft ?? initialContent ?? { type: "doc", content: [{ type: "paragraph" }] },
      editorProps: {
        handlePaste: (view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of items) {
            if (item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file) {
                uploadImageFile(file).then((src) => {
                  const { tr } = view.state;
                  const node = view.state.schema.nodes.image.create({ src });
                  view.dispatch(tr.replaceSelectionWith(node));
                }).catch((err) => {
                  console.error("Image paste upload failed:", err);
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
            uploadImageFile(file).then((src) => {
              const { tr } = view.state;
              const node = view.state.schema.nodes.image.create({ src });
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (pos) {
                view.dispatch(tr.insert(pos.pos, node));
              } else {
                view.dispatch(tr.replaceSelectionWith(node));
              }
            });
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        const json = ed.getJSON() as DocumentNode;
        // Persist draft to localStorage
        try {
          localStorage.setItem(getDraftKey(documentId), JSON.stringify(json));
        } catch {
          // Storage full — ignore
        }
        onChange?.(json);
      },
    });

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
          <Toolbar editor={editor} />
          <div className="min-h-[300px] p-4 text-gray-200">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Live preview pane */}
        <div className="flex-1 rounded-lg border border-hacman-gray bg-hacman-dark p-4">
          <h3 className="mb-2 text-sm font-semibold text-hacman-muted">Preview</h3>
          <div
            className="prose prose-invert max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: editor.getHTML() }}
          />
        </div>
      </div>
    );
  },
);

export default RichTextEditor;
