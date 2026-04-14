import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";

interface SearchResult {
  id: string;
  title: string;
  category: string;
  snippet: string;
  lastModified: number;
}

function formatDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`)
      .then(setResults)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-xl font-semibold text-white">
        Search results{query ? ` for "${query}"` : ""}
      </h2>

      {loading && (
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
          <span className="text-hacman-muted">Searching…</span>
        </div>
      )}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && !error && results.length === 0 && query && (
        <p className="text-hacman-muted">No documents matched your query.</p>
      )}

      <ul className="space-y-3">
        {results.map((r) => (
          <li key={r.id} className="rounded-xl border border-hacman-gray bg-hacman-dark p-4 transition hover:border-hacman-yellow/30">
            <Link
              to={`/documents/${r.id}`}
              className="text-lg font-medium text-hacman-yellow hover:underline"
            >
              {r.title}
            </Link>
            <p className="mt-1 text-xs text-hacman-muted">
              {r.category} · Last modified: {formatDate(r.lastModified)}
            </p>
            <p className="mt-1 text-sm text-gray-400">{r.snippet}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
