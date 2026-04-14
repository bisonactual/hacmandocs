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

interface UserRow {
  id: string;
  name: string;
  email: string;
}

interface DocumentRow {
  id: string;
  title: string;
}

const statusStyles: Record<string, string> = {
  pending: "bg-hacman-yellow/20 text-hacman-yellow border border-hacman-yellow/30",
  approved: "bg-green-500/20 text-green-400 border border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
};

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [users, setUsers] = useState<Map<string, UserRow>>(new Map());
  const [docs, setDocs] = useState<Map<string, DocumentRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");

  const load = async () => {
    setLoading(true);
    try {
      const url = filter ? `/api/proposals?status=${filter}` : "/api/proposals";
      const rows = await apiFetch<ProposalRow[]>(url);
      setProposals(rows.sort((a, b) => b.createdAt - a.createdAt));

      // Fetch user names and doc titles for display
      const authorIds = [...new Set(rows.map((p) => p.authorId))];
      const docIds = [...new Set(rows.map((p) => p.documentId))];

      const [userList, docList] = await Promise.all([
        apiFetch<UserRow[]>("/api/users"),
        Promise.all(
          docIds.map((id) =>
            apiFetch<DocumentRow>(`/api/documents/${id}`).catch(() => ({ id, title: "(deleted)" }))
          )
        ),
      ]);

      const userMap = new Map<string, UserRow>();
      for (const u of userList) userMap.set(u.id, u);
      setUsers(userMap);

      const docMap = new Map<string, DocumentRow>();
      for (const d of docList) docMap.set(d.id, d);
      setDocs(docMap);
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
          Review and manage edit proposals. Pending proposals need approval before changes go live.
        </p>
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

      {proposals.length === 0 ? (
        <p className="text-sm text-hacman-muted">No {filter || ""} proposals found.</p>
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
    </div>
  );
}
