import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import RichTextEditor from "../components/RichTextEditor";
import type { RichTextEditorHandle } from "../components/RichTextEditor";
import type { DocumentNode } from "@hacmandocs/shared";

interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
}

interface GroupOption {
  id: string;
  name: string;
  groupLevel: string;
}

export default function CreateDocumentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editorRef = useRef<RichTextEditorHandle>(null);
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(searchParams.get("categoryId") ?? "");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [visibilityGroups, setVisibilityGroups] = useState<GroupOption[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSetVisibility = user && (user.permissionLevel === "Admin" || user.groupLevel === "Manager");

  useEffect(() => {
    apiFetch<CategoryOption[]>("/api/categories").then(setCategories).catch(() => {});
    if (canSetVisibility) {
      apiFetch<GroupOption[]>("/api/groups").then(setVisibilityGroups).catch(() => {});
    }
  }, []);

  // Build indented category label
  const categoryLabel = (cat: CategoryOption): string => {
    const parts: string[] = [cat.name];
    let current = cat;
    while (current.parentId) {
      const parent = categories.find((c) => c.id === current.parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
    }
    return parts.join(" / ");
  };

  const handleSubmit = async () => {
    if (!title.trim() || !editorRef.current) return;
    setSubmitting(true);
    setError(null);

    try {
      const contentJson: DocumentNode = editorRef.current.getJSON();
      const res = await apiFetch<{ id: string }>("/api/documents", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          contentJson,
          categoryId: categoryId || null,
          ...(canSetVisibility && selectedGroupIds.length > 0 ? { groupIds: selectedGroupIds } : {}),
        }),
      });
      editorRef.current.clearDraft();

      // Editors+ can view their unpublished doc directly; Viewers see a confirmation
      const isEditor = user && ["Editor", "Approver", "Admin"].includes(user.permissionLevel);
      if (isEditor) {
        navigate(`/documents/${res.id}`);
      } else {
        navigate("/", { state: { flash: "Document submitted. An admin will review and publish it." } });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <button type="button" onClick={() => navigate(-1)} className="mb-4 text-sm text-hacman-yellow underline">
        ← Back
      </button>

      <h1 className="mb-4 text-2xl font-bold text-hacman-text">New Document</h1>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-hacman-muted mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            required
            className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
          />
        </div>
        <div>
          <label className="block text-xs text-hacman-muted mb-1">Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
          >
            <option value="">Uncategorised</option>
            {categories
              .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)))
              .map((c) => (
                <option key={c.id} value={c.id}>{categoryLabel(c)}</option>
              ))}
          </select>
        </div>
      </div>

      {canSetVisibility && visibilityGroups.length > 0 && (
        <div className="mb-4">
          <label className="block text-xs text-hacman-muted mb-1">Visibility (optional)</label>
          <div className="flex flex-wrap gap-2">
            {visibilityGroups.map((g) => (
              <label
                key={g.id}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                  selectedGroupIds.includes(g.id)
                    ? "border-hacman-yellow bg-hacman-yellow/10 text-hacman-yellow"
                    : "border-hacman-gray bg-hacman-black text-gray-400 hover:border-hacman-yellow/50"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selectedGroupIds.includes(g.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedGroupIds((prev) => [...prev, g.id]);
                    } else {
                      setSelectedGroupIds((prev) => prev.filter((id) => id !== g.id));
                    }
                  }}
                />
                {g.name}
                <span className="text-hacman-muted">({g.groupLevel})</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-hacman-muted">
            Restrict this document to selected groups. Leave empty for public access.
          </p>
        </div>
      )}

      <RichTextEditor
        ref={editorRef}
        documentId="new-document"
      />

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !title.trim()}
          className="rounded-lg bg-hacman-yellow px-5 py-2 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark disabled:opacity-50 transition-colors"
        >
          {submitting ? "Creating…" : "Create Document"}
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
