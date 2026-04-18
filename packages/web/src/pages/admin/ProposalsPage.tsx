import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";

interface ProposalRow {
  id: string;
  documentId: string;
  authorId: string;
  status: string;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

interface DeleteProposalRow {
  id: string;
  documentId: string;
  reason: string | null;
  authorId: string;
  status: string;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
}

interface DocumentRow {
  id: string;
  title: string;
}

interface RAProposalRow {
  id: string;
  toolRecordId: string;
  raId: string;
  proposedContentJson: string;
  authorId: string;
  status: string;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ToolRow {
  id: string;
  name: string;
}

const statusStyles: Record<string, string> = {
  pending: "bg-hacman-yellow/20 text-hacman-yellow border border-hacman-yellow/30",
  approved: "bg-green-500/20 text-green-400 border border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
};

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [deleteProps, setDeleteProps] = useState<DeleteProposalRow[]>([]);
  const [raProps, setRaProps] = useState<RAProposalRow[]>([]);
  const [users, setUsers] = useState<Map<string, UserRow>>(new Map());
  const [docs, setDocs] = useState<Map<string, DocumentRow>>(new Map());
  const [tools, setTools] = useState<Map<string, ToolRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");
  const [tab, setTab] = useState<"edit" | "delete" | "ra">("edit");

  const load = async () => {
    setLoading(true);
    try {
      const editUrl = filter ? `/api/proposals?status=${filter}` : "/api/proposals";
      const deleteUrl = filter ? `/api/delete-proposals?status=${filter}` : "/api/delete-proposals";
      const raUrl = filter ? `/api/ra-proposals?status=${filter}` : "/api/ra-proposals";
      const [editRows, deleteRows, raRows] = await Promise.all([
        apiFetch<ProposalRow[]>(editUrl),
        apiFetch<DeleteProposalRow[]>(deleteUrl),
        apiFetch<RAProposalRow[]>(raUrl),
      ]);
      setProposals(editRows.sort((a, b) => b.createdAt - a.createdAt));
      setDeleteProps(deleteRows.sort((a, b) => b.createdAt - a.createdAt));
      setRaProps(raRows.sort((a, b) => b.createdAt - a.createdAt));

      const allDocIds = [
        ...new Set([...editRows.map((p) => p.documentId), ...deleteRows.map((p) => p.documentId)]),
      ];

      const [userList, docList, toolList] = await Promise.all([
        apiFetch<UserRow[]>("/api/users"),
        Promise.all(
          allDocIds.map((id) =>
            apiFetch<DocumentRow>(`/api/documents/${id}`).catch(() => ({ id, title: "(deleted)" }))
          )
        ),
        apiFetch<ToolRow[]>("/api/inductions/tools").catch(() => []),
      ]);

      const userMap = new Map<string, UserRow>();
      for (const u of userList) userMap.set(u.id, u);
      setUsers(userMap);

      const docMap = new Map<string, DocumentRow>();
      for (const d of docList) docMap.set(d.id, d);
      setDocs(docMap);

      const toolMap = new Map<string, ToolRow>();
      for (const t of toolList) toolMap.set(t.id, t);
      setTools(toolMap);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const formatDate = (epoch: number) =>
    new Date(epoch * 1000).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });

  if (loading) return <p className="text-hacman-muted">Loading proposals…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">
          Review and manage edit and deletion proposals. Pending proposals need approval before changes go live.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-hacman-gray pb-2">
        <button
          onClick={() => setTab("edit")}
          className={`rounded-t-lg px-4 py-1.5 text-sm transition-colors ${
            tab === "edit"
              ? "bg-hacman-yellow text-hacman-black font-semibold"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Edit Proposals
        </button>
        <button
          onClick={() => setTab("delete")}
          className={`rounded-t-lg px-4 py-1.5 text-sm transition-colors ${
            tab === "delete"
              ? "bg-red-500 text-white font-semibold"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Delete Proposals
          {deleteProps.filter((d) => d.status === "pending").length > 0 && tab !== "delete" && (
            <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {deleteProps.filter((d) => d.status === "pending").length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("ra")}
          className={`rounded-t-lg px-4 py-1.5 text-sm transition-colors ${
            tab === "ra"
              ? "bg-blue-600 text-white font-semibold"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          RA Proposals
          {raProps.filter((r) => r.status === "pending").length > 0 && tab !== "ra" && (
            <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
              {raProps.filter((r) => r.status === "pending").length}
            </span>
          )}
        </button>
      </div>

      <div className="flex gap-2">
        {["pending", "approved", "rejected", ""].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1 text-sm transition-colors ${
              filter === s
                ? "bg-hacman-yellow text-hacman-black font-semibold"
                : "bg-hacman-gray text-gray-400 hover:text-gray-200"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {tab === "edit" && (
        <>
          {proposals.length === 0 ? (
            <p className="text-sm text-hacman-muted">No {filter || ""} edit proposals found.</p>
          ) : (
            <div className="space-y-2">
              {proposals.map((p) => {
                const author = users.get(p.authorId);
                const doc = docs.get(p.documentId);
                return (
                  <Link
                    key={p.id}
                    to={`/proposals/${p.id}`}
                    className="flex items-center justify-between rounded-lg border border-hacman-gray p-3 hover:border-hacman-yellow/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-200 truncate">
                        {doc?.title ?? p.documentId}
                      </p>
                      <p className="text-xs text-hacman-muted">
                        by {author?.name ?? author?.email ?? p.authorId} · {formatDate(p.createdAt)}
                      </p>
                    </div>
                    <span className={`ml-3 shrink-0 rounded px-2 py-0.5 text-xs ${statusStyles[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "delete" && (
        <DeleteProposalsList
          proposals={deleteProps}
          users={users}
          docs={docs}
          formatDate={formatDate}
          onRefresh={load}
        />
      )}

      {tab === "ra" && (
        <>
          {raProps.length === 0 ? (
            <p className="text-sm text-hacman-muted">No {filter || ""} RA proposals found.</p>
          ) : (
            <div className="space-y-2">
              {raProps.map((p) => {
                const author = users.get(p.authorId);
                const tool = tools.get(p.toolRecordId);
                return (
                  <Link
                    key={p.id}
                    to={`/ra-proposals/${p.id}`}
                    className="flex items-center justify-between rounded-lg border border-hacman-gray p-3 hover:border-blue-500/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-200 truncate">
                        {tool?.name ?? p.toolRecordId} — Risk Assessment
                      </p>
                      <p className="text-xs text-hacman-muted">
                        by {author?.name ?? author?.email ?? p.authorId} · {formatDate(p.createdAt)}
                      </p>
                    </div>
                    <span className={`ml-3 shrink-0 rounded px-2 py-0.5 text-xs ${statusStyles[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DeleteProposalsList({
  proposals,
  users,
  docs,
  formatDate,
  onRefresh,
}: {
  proposals: DeleteProposalRow[];
  users: Map<string, UserRow>;
  docs: Map<string, DocumentRow>;
  formatDate: (epoch: number) => string;
  onRefresh: () => void;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const approve = async (id: string) => {
    setActionError(null);
    try {
      await apiFetch(`/api/delete-proposals/${id}/approve`, { method: "PUT", body: JSON.stringify({}) });
      onRefresh();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const reject = async (id: string) => {
    setActionError(null);
    try {
      await apiFetch(`/api/delete-proposals/${id}/reject`, {
        method: "PUT",
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      setRejectingId(null);
      setRejectReason("");
      onRefresh();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  if (proposals.length === 0) {
    return <p className="text-sm text-hacman-muted">No delete proposals found.</p>;
  }

  return (
    <div className="space-y-2">
      {actionError && (
        <p className="text-sm text-red-400 mb-2">{actionError}</p>
      )}
      {proposals.map((p) => {
        const author = users.get(p.authorId);
        const doc = docs.get(p.documentId);
        return (
          <div
            key={p.id}
            className="rounded-lg border border-hacman-gray p-3"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-200 truncate">
                  🗑️ {doc?.title ?? p.documentId}
                </p>
                <p className="text-xs text-hacman-muted">
                  by {author?.name ?? author?.email ?? p.authorId} · {formatDate(p.createdAt)}
                </p>
                {p.reason && (
                  <p className="mt-1 text-xs text-gray-400 italic">Reason: {p.reason}</p>
                )}
                {p.rejectionReason && (
                  <p className="mt-1 text-xs text-red-400 italic">Rejected: {p.rejectionReason}</p>
                )}
              </div>
              <div className="ml-3 flex items-center gap-2">
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${statusStyles[p.status] ?? ""}`}>
                  {p.status}
                </span>
                {p.status === "pending" && (
                  <>
                    <button
                      type="button"
                      onClick={() => approve(p.id)}
                      className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                    >
                      Approve Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectingId(rejectingId === p.id ? null : p.id)}
                      className="rounded border border-hacman-gray px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
            {rejectingId === p.id && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Rejection reason (optional)"
                  className="flex-1 rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
                />
                <button
                  type="button"
                  onClick={() => reject(p.id)}
                  className="rounded bg-red-500/20 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  Confirm Reject
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
