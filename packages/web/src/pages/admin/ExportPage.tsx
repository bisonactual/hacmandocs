import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

interface DocItem {
  id: string;
  title: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export default function ExportPage() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<DocItem[]>("/api/documents")
      .then(setDocs)
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportSingle = (id: string) => {
    window.open(`${API_URL}/api/export/${id}`, "_blank");
  };

  const exportBulk = async () => {
    const token = localStorage.getItem("session_token");
    const res = await fetch(`${API_URL}/api/export/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ documentIds: [...selected] }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "export.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <p className="text-hacman-muted">Loading documents…</p>;

  return (
    <div className="max-w-xl">
      <div className="mb-4 rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">Export documents as Markdown files. Select individual documents or export multiple as a ZIP archive.</p>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-gray-400">
          {selected.size} selected
        </span>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={exportBulk}
          className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark disabled:opacity-50"
        >
          Export selected as ZIP
        </button>
      </div>
      <ul className="space-y-1">
        {docs.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-2 rounded-lg border border-hacman-gray px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.has(d.id)}
              onChange={() => toggle(d.id)}
              id={`exp-${d.id}`}
            />
            <label htmlFor={`exp-${d.id}`} className="flex-1 cursor-pointer text-gray-200">
              {d.title}
            </label>
            <button
              type="button"
              onClick={() => exportSingle(d.id)}
              className="text-xs text-hacman-yellow hover:underline"
            >
              Export
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
