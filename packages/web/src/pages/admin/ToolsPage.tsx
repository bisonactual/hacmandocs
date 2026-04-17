import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";

interface ToolRow {
  id: string;
  name: string;
  imageUrl: string | null;
  quizId: string | null;
  preInductionQuizId: string | null;
  refresherQuizId: string | null;
  retrainingIntervalDays: number | null;
  areaId: string | null;
  noInductionNeeded: number | null;
}

interface QuizOption { id: string; title: string; }
interface AreaOption { id: string; name: string; }
interface TrainerRow { userId: string; name: string; email: string; }
interface UserRow { id: string; name: string; email: string; }
interface RaStatus { toolRecordId: string; status: "draft" | "published"; }

const emptyForm = {
  name: "", quizId: "", preInductionQuizId: "", refresherQuizId: "",
  retrainingIntervalDays: "", areaId: "", noInductionNeeded: false,
};

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [quizzes, setQuizzes] = useState<QuizOption[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [trainerToolId, setTrainerToolId] = useState<string | null>(null);
  const [_trainers, setTrainers] = useState<TrainerRow[]>([]);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [selectedTrainers, setSelectedTrainers] = useState<string[]>([]);
  const [repairStatus, setRepairStatus] = useState<Record<string, string>>({});
  const [raStatuses, setRaStatuses] = useState<Record<string, "draft" | "published">>({});

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch<ToolRow[]>("/api/inductions/tools"),
      apiFetch<QuizOption[]>("/api/inductions/quizzes"),
      apiFetch<AreaOption[]>("/api/inductions/areas"),
      apiFetch<RaStatus[]>("/api/risk-assessments").catch(() => []),
    ])
      .then(([t, q, a, ra]) => {
        setTools(t);
        setQuizzes(q);
        setAreas(a);
        const map: Record<string, "draft" | "published"> = {};
        ra.forEach((r) => { map[r.toolRecordId] = r.status; });
        setRaStatuses(map);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const payload = {
      name: form.name,
      imageUrl: null,
      quizId: form.quizId || null,
      preInductionQuizId: form.preInductionQuizId || null,
      refresherQuizId: form.refresherQuizId || null,
      retrainingIntervalDays: form.retrainingIntervalDays ? Number(form.retrainingIntervalDays) : null,
      areaId: form.areaId || null,
      noInductionNeeded: form.noInductionNeeded ? 1 : 0,
    };
    try {
      if (editingId) {
        await apiFetch(`/api/inductions/tools/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/inductions/tools", { method: "POST", body: JSON.stringify(payload) });
      }
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleEdit = (tool: ToolRow) => {
    setEditingId(tool.id);
    setForm({
      name: tool.name,
      quizId: tool.quizId ?? "",
      preInductionQuizId: tool.preInductionQuizId ?? "",
      refresherQuizId: tool.refresherQuizId ?? "",
      retrainingIntervalDays: tool.retrainingIntervalDays?.toString() ?? "",
      areaId: tool.areaId ?? "",
      noInductionNeeded: tool.noInductionNeeded === 1,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tool record?")) return;
    try {
      await apiFetch(`/api/inductions/tools/${id}`, { method: "DELETE" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const openTrainers = async (toolId: string) => {
    setTrainerToolId(toolId);
    const [t, u] = await Promise.all([
      apiFetch<TrainerRow[]>(`/api/inductions/tools/${toolId}/trainers`),
      apiFetch<UserRow[]>("/api/users"),
    ]);
    setTrainers(t);
    setAllUsers(u);
    setSelectedTrainers(t.map((tr) => tr.userId));
  };

  const saveTrainers = async () => {
    if (!trainerToolId) return;
    await apiFetch(`/api/inductions/tools/${trainerToolId}/trainers`, {
      method: "PUT",
      body: JSON.stringify({ userIds: selectedTrainers }),
    });
    setTrainerToolId(null);
  };

  const handleRepairLink = async (toolId: string) => {
    setRepairStatus((prev) => ({ ...prev, [toolId]: "repairing" }));
    try {
      await apiFetch(`/api/inductions/tools/${toolId}/repair-link`, { method: "POST" });
      setRepairStatus((prev) => ({ ...prev, [toolId]: "linked" }));
      setTimeout(() => setRepairStatus((prev) => { const next = { ...prev }; delete next[toolId]; return next; }), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Repair failed";
      setRepairStatus((prev) => ({ ...prev, [toolId]: `error: ${msg}` }));
      setTimeout(() => setRepairStatus((prev) => { const next = { ...prev }; delete next[toolId]; return next; }), 3000);
    }
  };

  const quizName = (id: string | null) => quizzes.find((q) => q.id === id)?.title ?? "—";
  const areaName = (id: string | null) => areas.find((a) => a.id === id)?.name ?? "—";

  if (loading) return <p className="text-hacman-muted">Loading tools…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">Manage tools and machines. Each tool can have a pre-induction quiz, an online induction quiz, a refresher quiz, and in-person signoff checklists. Assign trainers to control who can sign off inductions.</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <p className="text-xs text-hacman-muted">You can add information for a tool by selecting a quiz here and ticking no induction required.</p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-hacman-gray p-4">
        <div>
          <label className="block text-xs text-hacman-muted">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow" />
        </div>
        <div>
          <label className="block text-xs text-hacman-muted">Area</label>
          <select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })} className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow">
            <option value="">None</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-hacman-muted">Online Induction Quiz / Info</label>
          <select value={form.quizId} onChange={(e) => setForm({ ...form, quizId: e.target.value })} className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow">
            <option value="">None</option>
            {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-hacman-muted">Pre-Induction Quiz</label>
          <select value={form.preInductionQuizId} onChange={(e) => setForm({ ...form, preInductionQuizId: e.target.value })} className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow">
            <option value="">None</option>
            {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-hacman-muted">Refresher Quiz</label>
          <select value={form.refresherQuizId} onChange={(e) => setForm({ ...form, refresherQuizId: e.target.value })} className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow">
            <option value="">None</option>
            {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
          </select>
        </div>
        {form.refresherQuizId && (
          <div>
            <label className="block text-xs text-hacman-muted">Retraining Interval (days)</label>
            <input type="number" min="1" value={form.retrainingIntervalDays} onChange={(e) => setForm({ ...form, retrainingIntervalDays: e.target.value })} required className="w-24 rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-gray-200 cursor-pointer">
            <input type="checkbox" checked={form.noInductionNeeded} onChange={(e) => setForm({ ...form, noInductionNeeded: e.target.checked })} className="accent-hacman-yellow" />
            No induction required
          </label>
        </div>
        <button type="submit" className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark">
          {editingId ? "Update" : "Create"}
        </button>
        {editingId && (
          <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="text-sm text-gray-400 hover:text-hacman-yellow">Cancel</button>
        )}
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-hacman-gray text-hacman-muted">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Area</th>
            <th className="py-2 pr-4">Pre-Induction</th>
            <th className="py-2 pr-4">Online Induction</th>
            <th className="py-2 pr-4">Refresher</th>
            <th className="py-2 pr-4">Interval</th>
            <th className="py-2 pr-4">Risk Assessment</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.id} className="border-b border-hacman-gray/50">
              <td className="py-2 pr-4 text-gray-200">{t.name}</td>
              <td className="py-2 pr-4 text-xs text-gray-400">{areaName(t.areaId)}</td>
              <td className="py-2 pr-4 text-xs text-gray-400">{quizName(t.preInductionQuizId)}</td>
              <td className="py-2 pr-4 text-xs text-gray-400">{quizName(t.quizId)}</td>
              <td className="py-2 pr-4 text-xs text-gray-400">{quizName(t.refresherQuizId)}</td>
              <td className="py-2 pr-4 text-gray-400">{t.retrainingIntervalDays ? `${t.retrainingIntervalDays}d` : "—"}</td>
              <td className="py-2 pr-4">
                {raStatuses[t.id] === "published" ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400 border border-green-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />Published
                    </span>
                    <Link to={`/inductions/risk-assessment/${t.id}/edit`} className="text-xs text-hacman-yellow hover:underline">Edit</Link>
                  </div>
                ) : raStatuses[t.id] === "draft" ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Draft
                    </span>
                    <Link to={`/inductions/risk-assessment/${t.id}/edit`} className="text-xs text-hacman-yellow hover:underline">Edit</Link>
                    <Link to={`/inductions/risk-assessment/${t.id}`} className="text-xs text-gray-400 hover:underline">View</Link>
                  </div>
                ) : (
                  <Link
                    to={`/inductions/risk-assessment/${t.id}/edit`}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-hacman-gray px-2 py-0.5 text-xs text-gray-500 hover:border-hacman-yellow/50 hover:text-hacman-yellow transition-colors"
                  >
                    + Create RA
                  </Link>
                )}
              </td>
              <td className="flex gap-2 py-2">
                <button onClick={() => handleEdit(t)} className="text-hacman-yellow hover:underline text-xs">Edit</button>
                <button onClick={() => openTrainers(t.id)} className="text-green-400 hover:underline text-xs">Trainers</button>
                <button onClick={() => handleRepairLink(t.id)} disabled={repairStatus[t.id] === "repairing"} className="text-blue-400 hover:underline text-xs disabled:opacity-50">
                  {repairStatus[t.id] === "repairing" ? "Repairing…" : repairStatus[t.id] === "linked" ? "Linked!" : repairStatus[t.id]?.startsWith("error:") ? repairStatus[t.id].slice(7) : "Repair Link"}
                </button>
                <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:underline text-xs">Delete</button>
              </td>
            </tr>
          ))}
          {tools.length === 0 && (
            <tr><td colSpan={7} className="py-4 text-center text-hacman-muted">No tool records yet.</td></tr>
          )}
        </tbody>
      </table>

      {trainerToolId && (
        <div className="rounded-lg border border-hacman-gray p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-200">
            Manage Trainers — {tools.find((t) => t.id === trainerToolId)?.name}
          </h3>
          <div className="flex flex-wrap gap-2">
            {allUsers.map((u) => (
              <label key={u.id} className="flex items-center gap-1 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={selectedTrainers.includes(u.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTrainers([...selectedTrainers, u.id]);
                    } else {
                      setSelectedTrainers(selectedTrainers.filter((id) => id !== u.id));
                    }
                  }}
                  className="accent-hacman-yellow"
                />
                {u.name}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={saveTrainers} className="rounded-lg bg-hacman-yellow px-3 py-1 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark">Save</button>
            <button onClick={() => setTrainerToolId(null)} className="text-sm text-gray-400 hover:text-hacman-yellow">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
