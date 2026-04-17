import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

interface DocumentData {
  id: string;
  title: string;
  isSensitive: number;
}

export default function ProposeDeletePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdminOrApprover =
    user?.permissionLevel === "Admin" || user?.permissionLevel === "Approver";

  useEffect(() => {
    if (!id) return;
    apiFetch<DocumentData>(`/api/documents/${id}`)
      .then(setDoc)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async () => {
    if (!id) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ deleted?: boolean }>("/api/delete-proposals", {
        method: "POST",
        body: JSON.stringify({ documentId: id, reason: reason.trim() || undefined }),
      });
      if (res.deleted) {
        // Admin/Approver — doc was deleted immediately
        navigate("/", { replace: true });
      } else {
        // Proposal created — go back to the document
        navigate(`/documents/${id}`, { replace: true });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400">{error ?? "Document not found"}</p>
        <button type="button" onClick={() => navigate(-1)}
          className="mt-2 text-sm text-hacman-yellow underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-8">
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
        <h2 className="text-xl font-bold text-white mb-1">
          {isAdminOrApprover ? "Delete Document" : "Propose Deletion"}
        </h2>
        <p className="text-sm text-hacman-muted mb-4">
          {isAdminOrApprover
            ? "This will move the document to the recycle bin. It can be restored or permanently deleted from the admin panel."
            : "This will create a deletion request for an admin or approver to review."}
        </p>

        <div className="mb-4 rounded-lg border border-hacman-gray bg-hacman-dark px-4 py-3">
          <p className="text-sm text-gray-400">Document</p>
          <p className="text-gray-200 font-medium">
            {doc.isSensitive === 1 && <span className="mr-1 text-amber-500">🔒</span>}
            {doc.title}
          </p>
        </div>

        <label htmlFor="delete-reason" className="block text-sm text-gray-400 mb-1">
          Reason {isAdminOrApprover ? "(optional)" : "(helps reviewers understand why)"}
        </label>
        <textarea
          id="delete-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why should this document be deleted?"
          rows={3}
          className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2 text-sm text-gray-200 placeholder-hacman-muted focus:border-red-500 focus:ring-red-500 mb-4"
        />

        {error && (
          <p className="mb-4 text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate(`/documents/${id}`)}
            className="rounded-lg border border-hacman-gray px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {submitting
              ? "Submitting…"
              : isAdminOrApprover
                ? "Delete Document"
                : "Propose Deletion"}
          </button>
        </div>
      </div>
    </div>
  );
}
