import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = () => {
    apiFetch<CategoryRow[]>("/api/categories")
      .then(setCategories)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch("/api/categories", {
      method: "POST",
      body: JSON.stringify({
        name,
        parentId: parentId || null,
        sortOrder: categories.length,
      }),
    });
    setName("");
    setParentId("");
    load();
  };

  const update = async (id: string) => {
    await apiFetch(`/api/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name: editName }),
    });
    setEditId(null);
    load();
  };

  const remove = async (id: string) => {
    await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <p className="text-hacman-muted">Loading categories…</p>;

  return (
    <div className="max-w-xl">
      <div className="mb-4 rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">Organise documents into categories and subcategories. Categories appear in the sidebar navigation for easy browsing.</p>
      </div>

      <form onSubmit={create} className="mb-4 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          required
          className="flex-1 rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
        />
        <label htmlFor="parent-select" className="sr-only">
          Parent category
        </label>
        <select
          id="parent-select"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1.5 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
        >
          <option value="">No parent</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark"
        >
          Add
        </button>
      </form>

      <ul className="space-y-1">
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-2 rounded-lg border border-hacman-gray px-3 py-2 text-sm"
          >
            {editId === c.id ? (
              <>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
                />
                <button
                  type="button"
                  onClick={() => update(c.id)}
                  className="text-xs text-hacman-yellow hover:underline"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditId(null)}
                  className="text-xs text-gray-400 hover:underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-gray-200">
                  {c.name}
                  {c.parentId && (
                    <span className="ml-1 text-xs text-hacman-muted">
                      (sub of{" "}
                      {categories.find((p) => p.id === c.parentId)?.name ??
                        c.parentId}
                      )
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditId(c.id);
                    setEditName(c.name);
                  }}
                  className="text-xs text-hacman-yellow hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
