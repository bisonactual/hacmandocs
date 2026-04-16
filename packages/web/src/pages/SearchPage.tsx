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

interface CategoryItem {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

interface DocumentItem {
  id: string;
  title: string;
  categoryId: string | null;
}

function formatDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function BrowseView() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<CategoryItem[]>("/api/categories"),
      apiFetch<DocumentItem[]>("/api/documents"),
    ])
      .then(([cats, docs]) => { setCategories(cats); setDocuments(docs); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
        <span className="text-hacman-muted">Loading…</span>
      </div>
    );
  }

  // Group documents by category
  const docsByCategory = new Map<string, DocumentItem[]>();
  const uncategorized: DocumentItem[] = [];
  for (const doc of documents) {
    if (doc.categoryId) {
      const list = docsByCategory.get(doc.categoryId) ?? [];
      list.push(doc);
      docsByCategory.set(doc.categoryId, list);
    } else {
      uncategorized.push(doc);
    }
  }

  const roots = categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6">
      {roots.map((cat) => {
        const docs = docsByCategory.get(cat.id) ?? [];
        const children = categories
          .filter((c) => c.parentId === cat.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (docs.length === 0 && children.length === 0) return null;
        return (
          <div key={cat.id}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-hacman-muted">{cat.name}</h3>
            <ul className="space-y-1">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link to={`/documents/${d.id}`} className="text-hacman-yellow hover:underline">{d.title}</Link>
                </li>
              ))}
              {children.map((child) => {
                const childDocs = docsByCategory.get(child.id) ?? [];
                if (childDocs.length === 0) return null;
                return (
                  <li key={child.id} className="ml-4 mt-2">
                    <p className="text-xs font-medium text-gray-400">{child.name}</p>
                    <ul className="mt-1 space-y-1">
                      {childDocs.map((d) => (
                        <li key={d.id}>
                          <Link to={`/documents/${d.id}`} className="text-hacman-yellow hover:underline">{d.title}</Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {uncategorized.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-hacman-muted">Uncategorized</h3>
          <ul className="space-y-1">
            {uncategorized.map((d) => (
              <li key={d.id}>
                <Link to={`/documents/${d.id}`} className="text-hacman-yellow hover:underline">{d.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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

  // No query — show browsable categories
  if (!query.trim()) {
    return (
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-4 text-xl font-semibold text-white">Browse Documentation</h2>
        <BrowseView />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-xl font-semibold text-white">
        Search results for "{query}"
      </h2>

      {loading && (
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
          <span className="text-hacman-muted">Searching…</span>
        </div>
      )}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && !error && results.length === 0 && (
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
