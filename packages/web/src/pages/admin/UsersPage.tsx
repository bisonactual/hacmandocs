import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { PermissionLevel } from "@hacmandocs/shared";

interface UserRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  permissionLevel: PermissionLevel;
}

const levels: PermissionLevel[] = ["Viewer", "Editor", "Approver", "Admin"];

const levelDescriptions: Record<PermissionLevel, string> = {
  Viewer: "Can browse and read published documents. No editing or approval rights.",
  Editor: "Can create and edit documents, and submit proposals for review.",
  Approver: "Can review, approve, or reject edit proposals in addition to Editor rights.",
  Admin: "Full access — manage users, categories, visibility groups, tools, and all settings.",
};

const emptyForm = { name: "", email: "", username: "", permissionLevel: "Viewer" as string };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", username: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch<UserRow[]>("/api/users")
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const changePermission = async (userId: string, level: PermissionLevel) => {
    await apiFetch(`/api/users/${userId}/permission`, {
      method: "PUT",
      body: JSON.stringify({ permissionLevel: level }),
    });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, permissionLevel: level } : u)),
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          username: form.username,
          permissionLevel: form.permissionLevel,
        }),
      });
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const startEdit = (u: UserRow) => {
    setEditingId(u.id);
    setEditForm({ name: u.name, email: u.email, username: u.username ?? "" });
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", email: "", username: "" });
  };

  const saveEdit = async (userId: string) => {
    setError("");
    try {
      const updated = await apiFetch<UserRow>(`/api/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      setEditingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleDelete = async (userId: string) => {
    setError("");
    try {
      await apiFetch(`/api/users/${userId}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeleteConfirm(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (loading) return <p className="text-hacman-muted">Loading users…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Users</h3>
        <p className="text-sm text-gray-400">
          Manage user accounts, permissions, and hackspace usernames.
        </p>
      </div>

      {/* Permission levels reference */}
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-hacman-muted mb-3">Permission Levels</h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {levels.map((l) => (
            <div key={l} className="flex items-start gap-2">
              <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                l === "Admin" ? "bg-red-500/20 text-red-400" :
                l === "Approver" ? "bg-purple-500/20 text-purple-400" :
                l === "Editor" ? "bg-blue-500/20 text-blue-400" :
                "bg-gray-500/20 text-gray-400"
              }`}>{l}</span>
              <span className="text-xs text-gray-400">{levelDescriptions[l]}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark"
        >
          {showForm ? "Cancel" : "Create User"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-lg border border-hacman-gray p-4">
          <div>
            <label className="block text-xs text-hacman-muted">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
            />
          </div>
          <div>
            <label className="block text-xs text-hacman-muted">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
            />
          </div>
          <div>
            <label className="block text-xs text-hacman-muted">Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
            />
          </div>
          <div>
            <label className="block text-xs text-hacman-muted">Permission</label>
            <select
              value={form.permissionLevel}
              onChange={(e) => setForm({ ...form, permissionLevel: e.target.value })}
              className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
            >
              {levels.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-green-600 px-4 py-1.5 text-sm text-white hover:bg-green-700">
            Create
          </button>
        </form>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-hacman-gray text-hacman-muted">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Username</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Permission</th>
            <th className="py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-hacman-gray/50">
              {editingId === u.id ? (
                <>
                  <td className="py-2 pr-4">
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full rounded border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editForm.username}
                      onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                      className="w-full rounded border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full rounded border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <label htmlFor={`perm-${u.id}`} className="sr-only">
                      Permission level for {u.name}
                    </label>
                    <select
                      id={`perm-${u.id}`}
                      value={u.permissionLevel}
                      onChange={(e) => changePermission(u.id, e.target.value as PermissionLevel)}
                      className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
                    >
                      {levels.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => saveEdit(u.id)}
                      className="mr-2 rounded bg-green-600 px-2.5 py-1 text-xs text-white hover:bg-green-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded bg-gray-600 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-4 text-gray-200">{u.name}</td>
                  <td className="py-2 pr-4 text-gray-400">{u.username ?? "—"}</td>
                  <td className="py-2 pr-4 text-gray-400">{u.email}</td>
                  <td className="py-2 pr-4">
                    <label htmlFor={`perm-${u.id}`} className="sr-only">
                      Permission level for {u.name}
                    </label>
                    <select
                      id={`perm-${u.id}`}
                      value={u.permissionLevel}
                      onChange={(e) => changePermission(u.id, e.target.value as PermissionLevel)}
                      className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
                    >
                      {levels.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => startEdit(u)}
                      className="mr-2 rounded bg-gray-600 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-500"
                    >
                      Edit
                    </button>
                    {deleteConfirm === u.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="mr-1 rounded bg-red-600 px-2.5 py-1 text-xs text-white hover:bg-red-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="rounded bg-gray-600 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-500"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(u.id)}
                        className="rounded bg-red-600/20 px-2.5 py-1 text-xs text-red-400 hover:bg-red-600/40"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
