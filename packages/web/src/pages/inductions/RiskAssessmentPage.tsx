import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import type { RiskAssessment, RiskAssessmentRow } from "@hacmandocs/shared";

// ── Risk score helpers ────────────────────────────────────────────────

function riskScore(l: number, s: number): number {
  return l * s;
}

function riskLabel(score: number): { bg: string; text: string; border: string; label: string } {
  if (score <= 5)  return { bg: "bg-green-900/60",  text: "text-green-300",  border: "border-green-700/60",  label: "Low" };
  if (score <= 12) return { bg: "bg-amber-900/60",  text: "text-amber-300",  border: "border-amber-700/60",  label: "Medium" };
  return           { bg: "bg-red-900/60",    text: "text-red-300",    border: "border-red-700/60",    label: "High" };
}

function RiskCell({ l, s }: { l: number; s: number }) {
  const score = riskScore(l, s);
  const { bg, text, border } = riskLabel(score);
  return (
    <td className={`border ${border} px-2 py-2 text-center font-bold text-sm ${bg} ${text}`}>
      {score}
    </td>
  );
}

function ScoreCell({ value }: { value: number }) {
  return (
    <td className="border border-hacman-gray/40 px-2 py-2 text-center text-sm text-gray-300">
      {value}
    </td>
  );
}

// ── Permission helpers ────────────────────────────────────────────────

const GROUP_RANK: Record<string, number> = {
  Non_Member: 0, Member: 1, Team_Leader: 2, Manager: 3, Board_Member: 4,
};

function isTeamLeaderPlus(groupLevel: string): boolean {
  return (GROUP_RANK[groupLevel] ?? 0) >= GROUP_RANK.Team_Leader;
}

// ── Main component ────────────────────────────────────────────────────

interface ToolInfo { id: string; name: string; }

export default function RiskAssessmentPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ra, setRa] = useState<RiskAssessment | null>(null);
  const [tool, setTool] = useState<ToolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    if (!toolId) return;
    setLoading(true);
    Promise.all([
      apiFetch<RiskAssessment>(`/api/risk-assessments/${toolId}`).catch((e: Error) => {
        if (e.message.includes("404") || e.message.toLowerCase().includes("not found")) { setNotFound(true); return null; }
        throw e;
      }),
      apiFetch<ToolInfo[]>("/api/inductions/tools").then((tools) => tools.find((t) => t.id === toolId) ?? null),
    ])
      .then(([raData, toolData]) => { setRa(raData); setTool(toolData ?? null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [toolId]);

  const isAdmin = user?.permissionLevel === "Admin";
  const isManager = user?.groupLevel === "Manager";
  const isPrivileged = isAdmin || isManager || isTeamLeaderPlus(user?.groupLevel ?? "");
  const canEdit = isPrivileged || false;
  const canCreate = !!user;
  const canPublish = isPrivileged;
  const canDelete = isPrivileged;

  const handlePublish = async () => {
    if (!toolId || !confirm("Publish this risk assessment? It will be visible to all members.")) return;
    setPublishing(true);
    try {
      await apiFetch(`/api/risk-assessments/${toolId}/publish`, { method: "PUT" });
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setPublishing(false); }
  };

  const handleUnpublish = async () => {
    if (!toolId || !confirm("Revert this risk assessment to draft?")) return;
    setPublishing(true);
    try {
      await apiFetch(`/api/risk-assessments/${toolId}/unpublish`, { method: "PUT" });
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setPublishing(false); }
  };

  const handleDelete = async () => {
    if (!toolId || !confirm("Permanently delete this risk assessment?")) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/risk-assessments/${toolId}`, { method: "DELETE" });
      navigate(-1);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setDeleting(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center space-y-4">
        <div className="text-5xl">📋</div>
        <h2 className="text-xl font-semibold text-white">No Risk Assessment Yet</h2>
        <p className="text-hacman-muted">
          {tool ? `A risk assessment hasn't been created for ${tool.name} yet.` : "No risk assessment found for this tool."}
        </p>
        {canCreate && (
          <button
            onClick={() => navigate(`/inductions/risk-assessment/${toolId}/edit`)}
            className="rounded-lg bg-hacman-yellow px-5 py-2 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors"
          >
            Create Risk Assessment
          </button>
        )}
      </div>
    );
  }

  if (error && !ra) {
    return <p className="text-red-400 py-8 text-center">{error}</p>;
  }

  if (!ra) return null;

  const { content } = ra;
  const isDraft = ra.status === "draft";

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-hacman-gray">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">
                {tool?.name ?? "Tool"} — Risk Assessment
              </h1>
              {isDraft ? (
                <span className="rounded-full bg-amber-500/20 px-3 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/30">
                  DRAFT
                </span>
              ) : (
                <span className="rounded-full bg-green-500/20 px-3 py-0.5 text-xs font-semibold text-green-400 border border-green-500/30">
                  PUBLISHED
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-hacman-muted">
              Last updated {new Date(ra.updatedAt * 1000).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button
                onClick={() => navigate(`/inductions/risk-assessment/${toolId}/edit`)}
                className="rounded-lg border border-hacman-yellow/40 px-4 py-1.5 text-sm text-hacman-yellow hover:bg-hacman-yellow/10 transition-colors"
              >
                Edit
              </button>
            )}
            {canPublish && isDraft && (
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {publishing ? "Publishing…" : "Publish"}
              </button>
            )}
            {canPublish && !isDraft && (
              <button
                onClick={handleUnpublish}
                disabled={publishing}
                className="rounded-lg border border-amber-500/40 px-4 py-1.5 text-sm text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
              >
                {publishing ? "…" : "Revert to Draft"}
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-red-500/40 px-4 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </div>

        {/* Requirements grid */}
        <div className="grid grid-cols-1 gap-px bg-hacman-gray sm:grid-cols-3">
          {/* Induction */}
          <div className="bg-hacman-dark px-5 py-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">🎓</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-hacman-muted">Induction Required</span>
            </div>
            <p className={`text-sm font-semibold ${content.inductionRequired ? "text-amber-300" : "text-green-400"}`}>
              {content.inductionRequired ? "Yes — In Person" : "Not Required"}
            </p>
            {content.inductionRequired && content.inductionDetails && (
              <p className="mt-1 text-xs text-gray-400">{content.inductionDetails}</p>
            )}
          </div>

          {/* PPE */}
          <div className="bg-hacman-dark px-5 py-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">🦺</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-hacman-muted">PPE Required</span>
            </div>
            <p className="text-sm text-amber-200">{content.ppeRequired}</p>
          </div>

          {/* Before Starting */}
          <div className="bg-hacman-dark px-5 py-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">✅</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-hacman-muted">Before Starting</span>
            </div>
            <p className="text-sm text-gray-300">{content.beforeStarting}</p>
          </div>
        </div>
      </div>

      {/* ── Risk Matrix Legend ─────────────────────────────────────── */}
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-5 py-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-hacman-muted">Risk Matrix</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2 rounded-lg border border-green-700/60 bg-green-900/40 px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
            <span className="text-xs font-semibold text-green-300">1–5 · Low — Continue Activity</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-700/60 bg-amber-900/40 px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="text-xs font-semibold text-amber-300">6–12 · Medium — Implement Controls</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-red-700/60 bg-red-900/40 px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="text-xs font-semibold text-red-300">13–25 · High — Stop Activity</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
          <span><span className="font-semibold text-gray-400">L</span> = Likelihood (1–5)</span>
          <span><span className="font-semibold text-gray-400">S</span> = Severity (1–5)</span>
          <span><span className="font-semibold text-gray-400">R</span> = Risk without controls (L × S)</span>
          <span><span className="font-semibold text-gray-400">LwC</span> = Likelihood with controls</span>
          <span><span className="font-semibold text-gray-400">SwC</span> = Severity with controls</span>
          <span><span className="font-semibold text-gray-400">RwC</span> = Risk with controls (LwC × SwC)</span>
        </div>
      </div>

      {/* ── Hazard Table ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
        <div className="px-5 py-3 border-b border-hacman-gray">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-hacman-muted">Hazard Assessment</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hacman-gray bg-hacman-gray/30">
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 min-w-[140px]">Hazard</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 min-w-[100px]">Who</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 w-10">L</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 w-10">S</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 w-12">R</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 min-w-[160px]">Rationale</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 min-w-[200px]">Controls Required</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 w-12">LwC</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 w-12">SwC</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 w-14">RwC</th>
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row: RiskAssessmentRow, i: number) => (
                <tr key={row.id} className={`border-b border-hacman-gray/50 ${i % 2 === 0 ? "bg-hacman-dark" : "bg-hacman-gray/10"}`}>
                  <td className="px-3 py-3 font-medium text-gray-200">{row.hazard}</td>
                  <td className="px-3 py-3 text-gray-400 text-xs">{row.who}</td>
                  <ScoreCell value={row.likelihood} />
                  <ScoreCell value={row.severity} />
                  <RiskCell l={row.likelihood} s={row.severity} />
                  <td className="px-3 py-3 text-gray-400 text-xs leading-relaxed">{row.rationale}</td>
                  <td className="px-3 py-3 text-gray-300 text-xs leading-relaxed">{row.controls}</td>
                  <ScoreCell value={row.likelihoodWithControls} />
                  <ScoreCell value={row.severityWithControls} />
                  <RiskCell l={row.likelihoodWithControls} s={row.severityWithControls} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Document info footer ───────────────────────────────────── */}
      {(content.createdBy || content.updatedBy || content.reviewBy) && (
        <div className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
          <div className="grid grid-cols-1 gap-px bg-hacman-gray sm:grid-cols-3">
            {content.createdBy && (
              <div className="bg-hacman-dark px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-hacman-muted">Created by</p>
                <p className="mt-1 text-sm text-gray-300">{content.createdBy}</p>
                {content.createdDate && <p className="text-xs text-gray-500">{content.createdDate}</p>}
              </div>
            )}
            {content.updatedBy && (
              <div className="bg-hacman-dark px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-hacman-muted">Updated by</p>
                <p className="mt-1 text-sm text-gray-300">{content.updatedBy}</p>
                {content.updatedDate && <p className="text-xs text-gray-500">{content.updatedDate}</p>}
              </div>
            )}
            {content.reviewBy && (
              <div className="bg-hacman-dark px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-hacman-muted">Review by</p>
                <p className="mt-1 text-sm text-gray-300">{content.reviewBy}</p>
                {content.reviewDate && <p className="text-xs text-gray-500">{content.reviewDate}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
