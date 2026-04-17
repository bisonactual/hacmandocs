import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import type { RiskAssessment, RiskAssessmentContent, RiskAssessmentRow } from "@hacmandocs/shared";

interface ToolInfo { id: string; name: string; }

function emptyRow(): RiskAssessmentRow {
  return {
    id: crypto.randomUUID(),
    hazard: "",
    who: "",
    likelihood: 3,
    severity: 3,
    rationale: "",
    controls: "",
    likelihoodWithControls: 1,
    severityWithControls: 3,
  };
}

function emptyContent(): RiskAssessmentContent {
  return {
    inductionRequired: true,
    inductionDetails: "",
    ppeRequired: "",
    beforeStarting: "",
    rows: [emptyRow()],
    createdBy: "",
    createdDate: "",
    updatedBy: "",
    updatedDate: "",
    reviewBy: "",
    reviewDate: "",
  };
}

function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-14 rounded border border-hacman-gray bg-hacman-black px-1 py-1 text-center text-sm text-gray-200"
    >
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

function riskScore(l: number, s: number): number { return l * s; }

function riskBadge(score: number) {
  if (score <= 5)  return <span className="rounded px-1.5 py-0.5 text-xs font-bold bg-green-900/60 text-green-300 border border-green-700/60">{score}</span>;
  if (score <= 12) return <span className="rounded px-1.5 py-0.5 text-xs font-bold bg-amber-900/60 text-amber-300 border border-amber-700/60">{score}</span>;
  return <span className="rounded px-1.5 py-0.5 text-xs font-bold bg-red-900/60 text-red-300 border border-red-700/60">{score}</span>;
}

export default function EditRiskAssessmentPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const navigate = useNavigate();

  const [tool, setTool] = useState<ToolInfo | null>(null);
  const [existing, setExisting] = useState<RiskAssessment | null>(null);
  const [content, setContent] = useState<RiskAssessmentContent>(emptyContent());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!toolId) return;
    Promise.all([
      apiFetch<ToolInfo[]>("/api/inductions/tools").then((tools) => tools.find((t) => t.id === toolId) ?? null),
      apiFetch<RiskAssessment>(`/api/risk-assessments/${toolId}`).catch(() => null),
    ])
      .then(([toolData, raData]) => {
        setTool(toolData);
        if (raData) { setExisting(raData); setContent(raData.content); }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [toolId]);

  const setField = <K extends keyof RiskAssessmentContent>(key: K, val: RiskAssessmentContent[K]) =>
    setContent((c) => ({ ...c, [key]: val }));

  const setRow = (idx: number, patch: Partial<RiskAssessmentRow>) =>
    setContent((c) => {
      const rows = [...c.rows];
      rows[idx] = { ...rows[idx], ...patch };
      return { ...c, rows };
    });

  const addRow = () => setContent((c) => ({ ...c, rows: [...c.rows, emptyRow()] }));
  const removeRow = (idx: number) => setContent((c) => ({ ...c, rows: c.rows.filter((_, i) => i !== idx) }));
  const moveRow = (idx: number, dir: -1 | 1) =>
    setContent((c) => {
      const rows = [...c.rows];
      const target = idx + dir;
      if (target < 0 || target >= rows.length) return c;
      [rows[idx], rows[target]] = [rows[target], rows[idx]];
      return { ...c, rows };
    });

  const save = async (publish = false) => {
    if (!toolId) return;
    setSaving(true); setError("");
    try {
      if (existing) {
        await apiFetch(`/api/risk-assessments/${toolId}`, { method: "PUT", body: JSON.stringify({ content }) });
      } else {
        await apiFetch(`/api/risk-assessments/${toolId}`, { method: "POST", body: JSON.stringify({ content }) });
      }
      if (publish) {
        await apiFetch(`/api/risk-assessments/${toolId}/publish`, { method: "PUT" });
      }
      navigate(`/inductions/risk-assessment/${toolId}`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">

      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {existing ? "Edit" : "Create"} Risk Assessment
          </h1>
          {tool && <p className="mt-1 text-sm text-hacman-muted">{tool.name}</p>}
        </div>
        <button onClick={() => navigate(-1)} className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
          ← Cancel
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* ── Requirements ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
        <div className="border-b border-hacman-gray px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-hacman-muted">Requirements</h2>
        </div>
        <div className="space-y-4 p-5">
          {/* Induction Required */}
          <div className="flex items-start gap-4">
            <label className="flex items-center gap-2 cursor-pointer mt-0.5">
              <input
                type="checkbox"
                checked={content.inductionRequired}
                onChange={(e) => setField("inductionRequired", e.target.checked)}
                className="h-4 w-4 rounded border-hacman-gray accent-hacman-yellow"
              />
              <span className="text-sm font-medium text-gray-200">In-person induction required</span>
            </label>
          </div>
          {content.inductionRequired && (
            <div>
              <label className="mb-1 block text-xs font-medium text-hacman-muted">Induction details</label>
              <input
                value={content.inductionDetails}
                onChange={(e) => setField("inductionDetails", e.target.value)}
                placeholder="e.g. Apply on the website. Only users with genuine use case trained"
                className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none"
              />
            </div>
          )}
          {/* PPE */}
          <div>
            <label className="mb-1 block text-xs font-medium text-hacman-muted">PPE Required</label>
            <input
              value={content.ppeRequired}
              onChange={(e) => setField("ppeRequired", e.target.value)}
              placeholder="e.g. Gloves (grinding), Faceshield, goggles, apron, long sleeves, closed footwear, mask"
              className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none"
            />
          </div>
          {/* Before Starting */}
          <div>
            <label className="mb-1 block text-xs font-medium text-hacman-muted">Before Starting</label>
            <input
              value={content.beforeStarting}
              onChange={(e) => setField("beforeStarting", e.target.value)}
              placeholder="e.g. Ensure equipment in good order, disc not damaged, and somebody in space"
              className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* ── Hazard Rows ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
        <div className="flex items-center justify-between border-b border-hacman-gray px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-hacman-muted">Hazards ({content.rows.length})</h2>
          <button
            onClick={addRow}
            className="rounded-lg bg-hacman-yellow px-3 py-1 text-xs font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors"
          >
            + Add Hazard
          </button>
        </div>

        <div className="divide-y divide-hacman-gray/50">
          {content.rows.map((row, idx) => (
            <div key={row.id} className="p-5 space-y-3">
              {/* Row header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-hacman-muted">Hazard {idx + 1}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveRow(idx, -1)} disabled={idx === 0}
                    className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors">↑</button>
                  <button onClick={() => moveRow(idx, 1)} disabled={idx === content.rows.length - 1}
                    className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors">↓</button>
                  <button onClick={() => removeRow(idx)} disabled={content.rows.length === 1}
                    className="ml-1 rounded px-2 py-0.5 text-xs text-red-500 hover:text-red-400 disabled:opacity-30 transition-colors">Remove</button>
                </div>
              </div>

              {/* Hazard + Who */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Hazard</label>
                  <input value={row.hazard} onChange={(e) => setRow(idx, { hazard: e.target.value })}
                    placeholder="e.g. Eye injury"
                    className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Who might be harmed</label>
                  <input value={row.who} onChange={(e) => setRow(idx, { who: e.target.value })}
                    placeholder="e.g. User, bystanders"
                    className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none" />
                </div>
              </div>

              {/* Without controls */}
              <div className="rounded-lg border border-hacman-gray/50 bg-hacman-gray/10 p-3 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Without Controls</p>
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Likelihood (L)</label>
                    <ScoreInput value={row.likelihood} onChange={(v) => setRow(idx, { likelihood: v })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Severity (S)</label>
                    <ScoreInput value={row.severity} onChange={(v) => setRow(idx, { severity: v })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Risk (R = L×S)</label>
                    <div className="flex items-center h-8">{riskBadge(riskScore(row.likelihood, row.severity))}</div>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Rationale (why this risk level)</label>
                  <textarea value={row.rationale} onChange={(e) => setRow(idx, { rationale: e.target.value })}
                    rows={2} placeholder="Explain why this hazard has this likelihood and severity…"
                    className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none resize-none" />
                </div>
              </div>

              {/* Controls */}
              <div>
                <label className="mb-1 block text-xs text-gray-500">Controls Required</label>
                <textarea value={row.controls} onChange={(e) => setRow(idx, { controls: e.target.value })}
                  rows={3} placeholder="Describe the controls that must be in place…"
                  className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none resize-none" />
              </div>

              {/* With controls */}
              <div className="rounded-lg border border-green-900/40 bg-green-900/10 p-3 space-y-2">
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">With Controls</p>
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Likelihood (LwC)</label>
                    <ScoreInput value={row.likelihoodWithControls} onChange={(v) => setRow(idx, { likelihoodWithControls: v })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Severity (SwC)</label>
                    <ScoreInput value={row.severityWithControls} onChange={(v) => setRow(idx, { severityWithControls: v })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Residual Risk (RwC)</label>
                    <div className="flex items-center h-8">{riskBadge(riskScore(row.likelihoodWithControls, row.severityWithControls))}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-hacman-gray px-5 py-3">
          <button
            onClick={addRow}
            className="w-full rounded-lg border border-dashed border-hacman-gray py-2 text-sm text-gray-500 hover:border-hacman-yellow/40 hover:text-hacman-yellow transition-colors"
          >
            + Add Hazard Row
          </button>
        </div>
      </section>

      {/* ── Document metadata ────────────────────────────────────────── */}
      <section className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
        <div className="border-b border-hacman-gray px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-hacman-muted">Document Information</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Created by</label>
              <input value={content.createdBy} onChange={(e) => setField("createdBy", e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Created date</label>
              <input value={content.createdDate} onChange={(e) => setField("createdDate", e.target.value)}
                placeholder="e.g. December 2022"
                className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none" />
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Updated by</label>
              <input value={content.updatedBy} onChange={(e) => setField("updatedBy", e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Updated date</label>
              <input value={content.updatedDate} onChange={(e) => setField("updatedDate", e.target.value)}
                placeholder="e.g. August 2024"
                className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none" />
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Review by</label>
              <input value={content.reviewBy} onChange={(e) => setField("reviewBy", e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Review date</label>
              <input value={content.reviewDate} onChange={(e) => setField("reviewDate", e.target.value)}
                placeholder="e.g. November 2025"
                className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-hacman-yellow/50 focus:outline-none" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Save buttons ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        <button onClick={() => navigate(-1)} className="rounded-lg border border-hacman-gray px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
          Cancel
        </button>
        <button
          onClick={() => save(false)}
          disabled={saving}
          className="rounded-lg border border-hacman-yellow/40 px-5 py-2 text-sm font-medium text-hacman-yellow hover:bg-hacman-yellow/10 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save as Draft"}
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving}
          className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save & Publish"}
        </button>
      </div>
    </div>
  );
}
