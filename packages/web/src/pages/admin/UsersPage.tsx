import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { PermissionLevel } from "@hacmandocs/shared";

interface UserRow {
  id: string;
  name: string;
  email: string;
  permissionLevel: PermissionLevel;
}

const levels: PermissionLevel[] = ["Viewer", "Editor", "Approver", "Admin"];

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<UserRow[]>("/api/users")
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const changePermission = async (userId: string, level: PermissionLevel) => {
    await apiFetch(`/api/users/${userId}/permission`, {
      method: "PUT",
      body: JSON.stringify({ permissionLevel: level }),
    });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, permissionLevel: level } : u)),
    );
  };

  if (loading) return <p className="text-gray-400">Loading users…</p>;

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-gray-500">
          <th className="py-2 pr-4">Name</th>
          <th className="py-2 pr-4">Email</th>
          <th className="py-2">Permission</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id} className="border-b border-gray-100">
            <td className="py-2 pr-4">{u.name}</td>
            <td className="py-2 pr-4 text-gray-500">{u.email}</td>
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
                className="rounded border border-gray-300 px-2 py-1 text-sm"
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
  );
}
