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

const emptyForm = { name: "", email: "", username: "", permissionLevel: "Viewer" as string };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

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

  if (loading) return <p className="text-hacman-muted">Loading users…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">Manage user accounts, permissions, and hackspace usernames. Create accounts for new members or adjust permission levels for existing ones.</p>
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
            <th className="py-2">Permission</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-hacman-gray/50">
              <td className="py-2 pr-4 text-gray-200">{u.name}</td>
              <td className="py-2 pr-4 text-gray-400">{u.username ?? "—"}</td>
              <td className="py-2 pr-4 text-gray-400">{u.email}</td>
              <td className="py-2">
                <label htmlFor={`perm-${u.id}`} className="sr-only">
                  Permission level for {u.name}
                </label>
                <select
                  id={`perm-${u.id}`}
                  value={u.permissionLevel}
                  onChange={(e) =>
                    changePermission(u.id, e.target.value as PermissionLevel)
                  }
                  className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
                >
                  {levels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
