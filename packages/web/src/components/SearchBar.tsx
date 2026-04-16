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
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-hacman-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          id="search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs…"
          className="w-36 rounded-md border border-hacman-gray bg-hacman-black pl-8 pr-3 py-1.5 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow transition-colors md:w-48"
        />
      </div>
    </form>
  );
}
