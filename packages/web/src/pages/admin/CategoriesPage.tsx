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

  if (loading) return <p className="text-gray-400">Loading categories…</p>;

  return (
    <div className="max-w-xl">
      <form onSubmit={create} className="mb-4 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          required
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <label htmlFor="parent-select" className="sr-only">
          Parent category
        </label>
        <select
          id="parent-select"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
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
          className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          Add
        </button>
      </form>

      <ul className="space-y-1">
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm"
          >
            {editId === c.id ? (
              <>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => update(c.id)}
                  className="text-xs text-blue-600 hover:underline"
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
                <span className="flex-1">
                  {c.name}
                  {c.parentId && (
                    <span className="ml-1 text-xs text-gray-400">
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
                  className="text-xs text-blue-600 hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="text-xs text-red-500 hover:underline"
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
