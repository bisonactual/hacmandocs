import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import type { DocumentNode } from "@hacmandocs/shared";

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
          ? "bg-blue-100 text-blue-700"
          : "text-gray-600 hover:bg-gray-100"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const addImage = useCallback(() => {
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
    <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 p-2">
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

      <span className="mx-1 border-l border-gray-300" />

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

      <span className="mx-1 border-l border-gray-300" />

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

      <span className="mx-1 border-l border-gray-300" />

      {/* Link & Image */}
      <ToolbarButton onClick={addLink} active={editor.isActive("link")} title="Add link">
        🔗 Link
      </ToolbarButton>
      <ToolbarButton onClick={addImage} title="Add image">
        🖼 Image
      </ToolbarButton>

      <span className="mx-1 border-l border-gray-300" />

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="flex-1 rounded border border-gray-300 bg-white">
          <Toolbar editor={editor} />
          <div className="min-h-[300px] p-4">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Live preview pane */}
        <div className="flex-1 rounded border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-500">Preview</h3>
          <div
            className="prose max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: editor.getHTML() }}
          />
        </div>
      </div>
    );
  },
);

export default RichTextEditor;
