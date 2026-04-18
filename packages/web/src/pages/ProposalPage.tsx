import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import ProposalDiffView from "../components/ProposalDiffView";
import type { DocumentNode } from "@hacmandocs/shared";

interface ProposalData {
  id: string;
  documentId: string;
  proposedContentJson: string;
  authorId: string;
  reviewerId: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

interface DiffData {
  before: DocumentNode;
  after: DocumentNode;
}

interface DocumentMeta {
  id: string;
  title: string;
  isSensitive: number;
}

export default function ProposalPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [docMeta, setDocMeta] = useState<DocumentMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch<ProposalData>(`/api/proposals/${id}`),
      apiFetch<DiffData>(`/api/proposals/${id}/diff`),
    ])
      .then(async ([p, d]) => {
        setProposal(p);
        setDiff(d);
        try {
          const doc = await apiFetch<DocumentMeta>(`/api/documents/${p.documentId}`);
          setDocMeta(doc);
        } catch {
          // non-critical
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleApprove = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/proposals/${id}/approve`, { method: "PUT" });
      setProposal((p) => (p ? { ...p, status: "approved" } : p));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/proposals/${id}/reject`, {
        method: "PUT",
        body: JSON.stringify({ reason: rejectionReason }),
      });
      setProposal((p) => (p ? { ...p, status: "rejected", rejectionReason } : p));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
    </div>
  );
  if (error || !proposal) {
    return (
      <div className="text-center">
        <p className="text-red-400">{error ?? "Proposal not found"}</p>
        <button type="button" onClick={() => navigate("/")} className="mt-2 text-sm text-hacman-yellow underline">
          Go back
        </button>
      </div>
    );
  }

  const isSensitive = docMeta?.isSensitive === 1;
  const isAdmin = user?.permissionLevel === "Admin";
  const isApprover = user?.permissionLevel === "Approver" || isAdmin;
  const isPending = proposal.status === "pending";
  const sensitiveReadOnly = isSensitive && !isAdmin && isApprover;

  return (
    <div className="mx-auto max-w-5xl">
      <button type="button" onClick={() => navigate(-1)} className="mb-4 text-sm text-hacman-yellow underline">
        ← Back
      </button>

      <h1 className="mb-1 text-2xl font-bold text-hacman-text">
        Edit Proposal
        {docMeta && <span className="ml-2 text-lg font-normal text-hacman-muted">for "{docMeta.title}"</span>}
      </h1>

      <div className="mb-4 flex items-center gap-3 text-sm text-hacman-muted">
        <span>
          Status:{" "}
          <span
            className={
              proposal.status === "approved"
                ? "font-medium text-green-400"
                : proposal.status === "rejected"
                  ? "font-medium text-red-400"
                  : "font-medium text-hacman-yellow"
            }
          >
            {proposal.status}
          </span>
        </span>
        <span>Author: {proposal.authorId}</span>
        <span>Created: {new Date(proposal.createdAt * 1000).toLocaleDateString()}</span>
      </div>

      {proposal.rejectionReason && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
          Rejection reason: {proposal.rejectionReason}
        </div>
      )}

      {sensitiveReadOnly && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-400">
          🔒 This is a sensitive document. Admin approval is required. You can view but not approve or reject this proposal.
        </div>
      )}

      {diff && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-gray-200">Changes</h2>
          <ProposalDiffView before={diff.before} after={diff.after} />
        </div>
      )}

      {isPending && isApprover && !sensitiveReadOnly && (
        <div className="rounded-xl border border-hacman-gray bg-hacman-dark p-4">
          <h2 className="mb-3 text-lg font-semibold text-hacman-text">Review</h2>
          <div className="mb-3">
            <label htmlFor="rejection-reason" className="mb-1 block text-sm text-gray-400">
              Rejection reason (required to reject):
            </label>
            <textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded-lg border border-hacman-gray bg-hacman-black p-2 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow"
              rows={3}
              placeholder="Explain why this proposal should be rejected…"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleApprove}
              disabled={actionLoading}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={actionLoading || !rejectionReason.trim()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
