import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

interface DeletedDoc {
  id: string;
  title: string;
  categoryId: string | null;
  isSensitive: number;
  deletedAt: number;
  createdAt: number;
  updatedAt: number;
}

export default function RecycleBinPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DeletedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const isAdmin = user?.permissionLevel === "Admin";

  const load = () => {
    setLoading(true);
    apiFetch<DeletedDoc[]>("/api/documents/recycle-bin")
      .then((rows) => setDocs(rows.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const restore = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/documents/${id}/restore`, {
        method: "PUT",
        body: JSON.stringify({}),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const permanentDelete = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
      setConfirmId(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const formatDate = (epoch: number) =>
    new Date(epoch * 1000).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });

  if (loading) return <p className="text-hacman-muted">Loading recycle bin…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">
          Documents that have been deleted are kept here. You can restore them or permanently delete them.
          {isAdmin
            ? " Permanent deletion cannot be undone."
            : " Only Admins can permanently delete documents."}
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {docs.length === 0 ? (
        <p className="text-sm text-hacman-muted">The recycle bin is empty.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-hacman-gray p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-200 truncate">
                  {d.isSensitive === 1 && <span className="mr-1 text-amber-500">🔒</span>}
                  {d.title}
                </p>
                <p className="text-xs text-hacman-muted">
                  Deleted {formatDate(d.deletedAt)}
                </p>
              </div>
              <div className="ml-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => restore(d.id)}
                  className="rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                >
                  Restore
                </button>
                {isAdmin && (
                  <>
                    {confirmId === d.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-400">Sure?</span>
                        <button
                          type="button"
                          onClick={() => permanentDelete(d.id)}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                        >
                          Yes, delete forever
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="rounded border border-hacman-gray px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(d.id)}
                        className="rounded border border-red-500/50 bg-red-500/10 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        Delete Forever
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
