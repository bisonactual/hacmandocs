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
      <h2 className="mb-4 text-xl font-semibold text-gray-800">
        Search results{query ? ` for "${query}"` : ""}
      </h2>

      {loading && <p className="text-gray-400">Searching…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && results.length === 0 && query && (
        <p className="text-gray-500">No documents matched your query.</p>
      )}

      <ul className="space-y-4">
        {results.map((r) => (
          <li key={r.id} className="rounded-md border border-gray-200 bg-white p-4">
            <Link
              to={`/documents/${r.id}`}
              className="text-lg font-medium text-blue-600 hover:underline"
            >
              {r.title}
            </Link>
            <p className="mt-1 text-xs text-gray-400">
              {r.category} · Last modified: {formatDate(r.lastModified)}
            </p>
            <p className="mt-1 text-sm text-gray-600">{r.snippet}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
