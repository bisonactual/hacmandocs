import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";

interface ChecklistItem { id: string; itemText: string; sortOrder: number; }
interface ChecklistSection { id: string; sectionTitle: string; sortOrder: number; items: ChecklistItem[]; }
interface SignoffData {
  tool: { id: string; name: string };
  checklist: ChecklistSection[];
  trainerConfirmationText: string;
  inducteeConfirmationText: string;
}

export default function SignoffFormPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const [data, setData] = useState<SignoffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trainerConfirmed, setTrainerConfirmed] = useState(false);
  const [inducteeConfirmed, setInducteeConfirmed] = useState(false);
  const [inducteeFullName, setInducteeFullName] = useState("");
  const [inducteeUsername, setInducteeUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ inducteeMatched: boolean } | null>(null);

  useEffect(() => {
    if (!toolId) return;
    apiFetch<SignoffData>(`/api/inductions/signoff/${toolId}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [toolId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const res = await apiFetch<{ inducteeMatched: boolean }>("/api/inductions/signoff", {
        method: "POST",
        body: JSON.stringify({ toolRecordId: toolId, inducteeFullName, inducteeUsername, trainerConfirmed, inducteeConfirmed }),
      });
      setSuccess(res);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Submission failed"); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" /></div>;
  if (error && !data) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  if (success) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center space-y-4">
        <p className="text-4xl">✅</p>
        <h2 className="text-xl font-semibold text-hacman-text">Signoff Complete</h2>
        <p className="text-gray-400">
          Induction signoff for <span className="font-medium text-hacman-text">{inducteeFullName}</span> on <span className="font-medium text-hacman-text">{data.tool.name}</span> has been recorded.
        </p>
        {success.inducteeMatched ? (
          <p className="text-sm text-green-400">User account matched — certification created automatically.</p>
        ) : (
          <p className="text-sm text-amber-400">No matching user account found. The signoff is recorded but no certification was created. The user can register and it will be linked later.</p>
        )}
        <Link to="/inductions/trainer" className="inline-block rounded-lg bg-hacman-yellow px-5 py-2 font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors">Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold text-hacman-text">Induction Signoff — {data.tool.name}</h2>

      {data.checklist.length > 0 && (
        <div className="rounded-xl border border-hacman-gray bg-hacman-dark p-4">
          <p className="text-sm text-hacman-muted mb-2">Checklist reference:</p>
          <Link to={`/inductions/checklist/${toolId}`} className="text-sm text-hacman-yellow hover:underline">View / Print Checklist →</Link>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
          <legend className="px-2 text-sm font-medium text-blue-400">Trainer Confirmation</legend>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={trainerConfirmed} onChange={(e) => setTrainerConfirmed(e.target.checked)} className="mt-1 accent-hacman-yellow" required />
            <span className="text-sm text-gray-300">{data.trainerConfirmationText}</span>
          </label>
        </fieldset>

        <fieldset className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-4">
          <legend className="px-2 text-sm font-medium text-green-400">Inductee Details</legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-hacman-muted mb-1">Full Name</label>
              <input value={inducteeFullName} onChange={(e) => setInducteeFullName(e.target.value)} required
                className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2 text-sm text-gray-200 focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow" />
            </div>
            <div>
              <label className="block text-xs text-hacman-muted mb-1">Hackspace Username</label>
              <input value={inducteeUsername} onChange={(e) => setInducteeUsername(e.target.value)} required
                className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2 text-sm text-gray-200 focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow" />
            </div>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={inducteeConfirmed} onChange={(e) => setInducteeConfirmed(e.target.checked)} className="mt-1 accent-hacman-yellow" required />
            <span className="text-sm text-gray-300">{data.inducteeConfirmationText}</span>
          </label>
        </fieldset>

        <button type="submit" disabled={submitting || !trainerConfirmed || !inducteeConfirmed}
          className="w-full rounded-lg bg-hacman-yellow px-6 py-3 font-semibold text-hacman-black hover:bg-hacman-yellow-dark disabled:opacity-50 transition-colors">
          {submitting ? "Submitting…" : "Submit Signoff"}
        </button>
      </form>
    </div>
  );
}
