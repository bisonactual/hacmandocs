import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { parseMarkdown, toMarkdown } from "@hacmandocs/shared";
import type { DocumentNode } from "@hacmandocs/shared";
import { apiFetch } from "../../lib/api";
import RichTextEditor from "../../components/RichTextEditor";
import type { RichTextEditorHandle } from "../../components/RichTextEditor";

/** Restricted extensions for quiz descriptions — no Image, Table, codeBlock */
const quizExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    link: false, // Disable StarterKit's bundled Link to avoid duplicate
  }),
  Link.configure({ openOnClick: false }),
];

interface QuizData {
  id: string;
  title: string;
  description: string | null;
}

export default function EditQuizDescriptionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editorRef = useRef<RichTextEditorHandle>(null);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [initialContent, setInitialContent] = useState<DocumentNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiFetch<QuizData>(`/api/inductions/quizzes/${id}`)
      .then((data) => {
        setQuiz(data);
        if (data.description) {
          setInitialContent(parseMarkdown(data.description));
        } else {
          setInitialContent({ type: "doc", content: [{ type: "paragraph" }] });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load quiz"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!id || !editorRef.current) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const json = editorRef.current.getJSON();
      const markdown = toMarkdown(json);
      await apiFetch(`/api/inductions/quizzes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ description: markdown }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-hacman-muted">Loading quiz…</p>;
  if (error && !quiz) return <p className="text-sm text-red-400">{error}</p>;
  if (!quiz || !initialContent) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate("/admin/quizzes")}
            className="text-sm text-hacman-yellow hover:underline"
          >
            ← Back to Quizzes & Information
          </button>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Edit Description — {quiz.title}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-400">Saved ✓</span>}
          {error && <span className="text-sm text-red-400">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Description"}
          </button>
        </div>
      </div>

      <RichTextEditor
        ref={editorRef}
        documentId={`quiz-desc-${id}`}
        initialContent={initialContent}
        extensions={quizExtensions}
      />
    </div>
  );
}
