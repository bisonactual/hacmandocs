import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed) {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [query, navigate],
  );

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <label htmlFor="search-input" className="sr-only">
        Search documents
      </label>
      <input
        id="search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search docs…"
        className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <button
        type="submit"
        className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
      >
        Search
      </button>
    </form>
  );
}
