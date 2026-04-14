import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

interface AreaRow { id: string; name: string; }
interface LeaderRow { userId: string; name: string; email: string; }
interface UserRow { id: string; name: string; email: string; }

const emptyForm = { name: "" };

export default function AreasPage() {
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [leaderAreaId, setLeaderAreaId] = useState<string | null>(null);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [selectedLeaders, setSelectedLeaders] = useState<string[]>([]);

  const load = () => {
    setLoading(true);
    apiFetch<AreaRow[]>("/api/inductions/areas")
      .then(setAreas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await apiFetch(`/api/inductions/areas/${editingId}`, {
          method: "PUT", body: JSON.stringify({ name: form.name }),
        });
      } else {
        await apiFetch("/api/inductions/areas", {
          method: "POST", body: JSON.stringify({ name: form.name }),
        });
      }
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this area?")) return;
    try {
      await apiFetch(`/api/inductions/areas/${id}`, { method: "DELETE" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const openLeaders = async (areaId: string) => {
    setLeaderAreaId(areaId);
    const [l, u] = await Promise.all([
      apiFetch<LeaderRow[]>(`/api/inductions/areas/${areaId}/leaders`),
      apiFetch<UserRow[]>("/api/users"),
    ]);
    setLeaders(l);
    setAllUsers(u);
    setSelectedLeaders(l.map((lr) => lr.userId));
  };

  const saveLeaders = async () => {
    if (!leaderAreaId) return;
    await apiFetch(`/api/inductions/areas/${leaderAreaId}/leaders`, {
      method: "PUT",
      body: JSON.stringify({ userIds: selectedLeaders }),
    });
    setLeaderAreaId(null);
  };

  if (loading) return <p className="text-hacman-muted">Loading areas…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">Define workshop areas (e.g. Woodwork, Metalwork, Laser). Assign team leaders who can manage tools and trainers within their area.</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <form onSubmit={handleSubmit} className="flex items-end gap-3 rounded-lg border border-hacman-gray p-4">
        <div>
          <label className="block text-xs text-hacman-muted">Area Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
          />
        </div>
        <button type="submit" className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark">
          {editingId ? "Update" : "Create"}
        </button>
        {editingId && (
          <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="text-sm text-gray-400 hover:text-hacman-yellow">
            Cancel
          </button>
        )}
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-hacman-gray text-hacman-muted">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.id} className="border-b border-hacman-gray/50">
              <td className="py-2 pr-4 text-gray-200">{a.name}</td>
              <td className="flex gap-2 py-2">
                <button onClick={() => { setEditingId(a.id); setForm({ name: a.name }); }} className="text-hacman-yellow hover:underline text-xs">Edit</button>
                <button onClick={() => openLeaders(a.id)} className="text-green-400 hover:underline text-xs">Leaders</button>
                <button onClick={() => handleDelete(a.id)} className="text-red-400 hover:underline text-xs">Delete</button>
              </td>
            </tr>
          ))}
          {areas.length === 0 && (
            <tr><td colSpan={2} className="py-4 text-center text-hacman-muted">No areas yet.</td></tr>
          )}
        </tbody>
      </table>

      {leaderAreaId && (
        <div className="rounded-lg border border-hacman-gray p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-200">
            Manage Leaders — {areas.find((a) => a.id === leaderAreaId)?.name}
          </h3>
          <div className="flex flex-wrap gap-2">
            {allUsers.map((u) => (
              <label key={u.id} className="flex items-center gap-1 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={selectedLeaders.includes(u.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedLeaders([...selectedLeaders, u.id]);
                    } else {
                      setSelectedLeaders(selectedLeaders.filter((id) => id !== u.id));
                    }
                  }}
                  className="accent-hacman-yellow"
                />
                {u.name}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={saveLeaders} className="rounded-lg bg-hacman-yellow px-3 py-1 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark">Save</button>
            <button onClick={() => setLeaderAreaId(null)} className="text-sm text-gray-400 hover:text-hacman-yellow">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
