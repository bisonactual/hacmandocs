import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import RichTextEditor from "../components/RichTextEditor";
import type { RichTextEditorHandle } from "../components/RichTextEditor";
import type { DocumentNode } from "@hacmandocs/shared";

interface DocumentData {
  id: string;
  title: string;
  contentJson: string;
}

export default function ProposeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editorRef = useRef<RichTextEditorHandle>(null);

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch<DocumentData>(`/api/documents/${id}`)
      .then(setDoc)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async () => {
    if (!id || !editorRef.current) return;
    setSubmitting(true);
    setError(null);

    try {
      const proposedContent = editorRef.current.getJSON();
      await apiFetch("/api/proposals", {
        method: "POST",
        body: JSON.stringify({
          documentId: id,
          proposedContentJson: proposedContent,
        }),
      });
      editorRef.current.clearDraft();
      navigate(`/documents/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
    </div>
  );
  if (error && !doc) {
    return (
      <div className="text-center">
        <p className="text-red-400">{error}</p>
        <button type="button" onClick={() => navigate(-1)} className="mt-2 text-sm text-hacman-yellow underline">
          Go back
        </button>
      </div>
    );
  }
  if (!doc) return null;

  const initialContent: DocumentNode = JSON.parse(doc.contentJson);

  return (
    <div className="mx-auto max-w-6xl">
      <button type="button" onClick={() => navigate(-1)} className="mb-4 text-sm text-hacman-yellow underline">
        ← Back
      </button>

      <h1 className="mb-1 text-2xl font-bold text-white">Propose Edit</h1>
      <p className="mb-4 text-sm text-hacman-muted">Editing: {doc.title}</p>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <RichTextEditor
        ref={editorRef}
        documentId={`propose-${doc.id}`}
        initialContent={initialContent}
      />

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-hacman-yellow px-5 py-2 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark disabled:opacity-50 transition-colors"
        >
          {submitting ? "Submitting…" : "Submit Proposal"}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg border border-hacman-gray px-5 py-2 text-sm text-gray-400 hover:border-hacman-yellow hover:text-hacman-yellow transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
