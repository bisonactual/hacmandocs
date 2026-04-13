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

  if (loading) return <p className="text-gray-400">Loading proposal…</p>;
  if (error || !proposal) {
    return (
      <div className="text-center">
        <p className="text-red-600">{error ?? "Proposal not found"}</p>
        <button type="button" onClick={() => navigate("/")} className="mt-2 text-sm text-blue-600 underline">
          Go back
        </button>
      </div>
    );
  }

  const isSensitive = docMeta?.isSensitive === 1;
  const isAdmin = user?.permissionLevel === "Admin";
  const isApprover = user?.permissionLevel === "Approver" || isAdmin;
  const isPending = proposal.status === "pending";

  // Sensitive docs: non-Admin Approvers see read-only with notice
  const sensitiveReadOnly = isSensitive && !isAdmin && isApprover;

  return (
    <div className="mx-auto max-w-5xl">
      <button type="button" onClick={() => navigate(-1)} className="mb-4 text-sm text-blue-600 underline">
        ← Back
      </button>

      <h1 className="mb-1 text-2xl font-bold text-gray-900">
        Edit Proposal
        {docMeta && <span className="ml-2 text-lg font-normal text-gray-500">for "{docMeta.title}"</span>}
      </h1>

      <div className="mb-4 flex items-center gap-3 text-sm text-gray-500">
        <span>
          Status:{" "}
          <span
            className={
              proposal.status === "approved"
                ? "font-medium text-green-600"
                : proposal.status === "rejected"
                  ? "font-medium text-red-600"
                  : "font-medium text-yellow-600"
            }
          >
            {proposal.status}
          </span>
        </span>
        <span>Author: {proposal.authorId}</span>
        <span>Created: {new Date(proposal.createdAt * 1000).toLocaleDateString()}</span>
      </div>

      {proposal.rejectionReason && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Rejection reason: {proposal.rejectionReason}
        </div>
      )}

      {sensitiveReadOnly && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          🔒 This is a sensitive document. Admin approval is required. You can view but not approve or reject this proposal.
        </div>
      )}

      {/* Diff view */}
      {diff && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-gray-700">Changes</h2>
          <ProposalDiffView before={diff.before} after={diff.after} />
        </div>
      )}

      {/* Approval / Rejection UI — only for Approver+ on pending proposals */}
      {isPending && isApprover && !sensitiveReadOnly && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-700">Review</h2>
          <div className="mb-3">
            <label htmlFor="rejection-reason" className="mb-1 block text-sm text-gray-600">
              Rejection reason (required to reject):
            </label>
            <textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded border border-gray-300 p-2 text-sm"
              rows={3}
              placeholder="Explain why this proposal should be rejected…"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleApprove}
              disabled={actionLoading}
              className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={actionLoading || !rejectionReason.trim()}
              className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
