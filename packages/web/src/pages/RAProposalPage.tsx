import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { RiskAssessmentContent, RiskAssessmentRow } from "@hacmandocs/shared";

interface RAProposalData {
  id: string;
  toolRecordId: string;
  raId: string;
  proposedContentJson: string;
  authorId: string;
  reviewerId: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

interface DiffData {
  current: RiskAssessmentContent;
  proposed: RiskAssessmentContent;
  status: string;
}

interface ToolInfo { id: string; name: string; }

const GROUP_RANK: Record<string, number> = {
  Non_Member: 0, Member: 1, Team_Leader: 2, Manager: 3, Board_Member: 4,
};

function isTeamLeaderPlus(groupLevel: string): boolean {
  return (GROUP_RANK[groupLevel] ?? 0) >= GROUP_RANK.Team_Leader;
}

function riskScore(l: number, s: number): number { return l * s; }

function riskLabel(score: number) {
  if (score <= 5)  return { bg: "bg-green-900/60",  text: "text-green-300",  border: "border-green-700/60" };
  if (score <= 12) return { bg: "bg-amber-900/60",  text: "text-amber-300",  border: "border-amber-700/60" };
  return           { bg: "bg-red-900/60",    text: "text-red-300",    border: "border-red-700/60" };
}

function RiskBadge({ l, s }: { l: number; s: number }) {
  const score = riskScore(l, s);
  const { bg, text, border } = riskLabel(score);
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold border ${bg} ${text} ${border}`}>{score}</span>;
}

function FieldDiff({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  return (
    <div className={`rounded-lg border p-3 ${changed ? "border-hacman-yellow/40 bg-hacman-yellow/5" : "border-hacman-gray"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-hacman-muted mb-2">{label}</p>
      {changed ? (
        <div className="space-y-1">
          <p className="text-xs text-red-400 line-through">{String(before)}</p>
          <p className="text-xs text-green-400">{String(after)}</p>
        </div>
      ) : (
        <p className="text-xs text-gray-400">{String(before)} <span className="text-gray-600">(unchanged)</span></p>
      )}
    </div>
  );
}

function HazardDiff({ current, proposed }: { current: RiskAssessmentRow | null; proposed: RiskAssessmentRow | null }) {
  const isNew = current === null;
  const isRemoved = proposed === null;
  const row = proposed ?? current!;

  return (
    <div className={`rounded-lg border p-4 space-y-2 ${isNew ? "border-green-500/40 bg-green-500/5" : isRemoved ? "border-red-500/40 bg-red-500/5" : "border-hacman-gray"}`}>
      <div className="flex items-center gap-2">
        {isNew && <span className="text-xs font-bold text-green-400 bg-green-500/20 px-2 py-0.5 rounded">NEW</span>}
        {isRemoved && <span className="text-xs font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded">REMOVED</span>}
        <p className="text-sm font-medium text-gray-200">{row.hazard || "(no hazard)"}</p>
        <span className="text-xs text-gray-500">— {row.who}</span>
      </div>
      {!isNew && !isRemoved && current && proposed && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ["Likelihood", current.likelihood, proposed.likelihood],
            ["Severity", current.severity, proposed.severity],
            ["L with controls", current.likelihoodWithControls, proposed.likelihoodWithControls],
            ["S with controls", current.severityWithControls, proposed.severityWithControls],
          ].filter(([, a, b]) => a !== b).map(([label, before, after]) => (
            <div key={String(label)} className="rounded border border-hacman-yellow/30 bg-hacman-yellow/5 p-2">
              <p className="text-gray-500 uppercase tracking-wide mb-1">{label}</p>
              <span className="text-red-400 line-through mr-2">{String(before)}</span>
              <span className="text-green-400">{String(after)}</span>
            </div>
          ))}
          {current.controls !== proposed.controls && (
            <div className="col-span-2 rounded border border-hacman-yellow/30 bg-hacman-yellow/5 p-2">
              <p className="text-gray-500 uppercase tracking-wide mb-1">Controls</p>
              <p className="text-red-400 line-through text-xs">{current.controls}</p>
              <p className="text-green-400 text-xs">{proposed.controls}</p>
            </div>
          )}
          {current.rationale !== proposed.rationale && (
            <div className="col-span-2 rounded border border-hacman-yellow/30 bg-hacman-yellow/5 p-2">
              <p className="text-gray-500 uppercase tracking-wide mb-1">Rationale</p>
              <p className="text-red-400 line-through text-xs">{current.rationale}</p>
              <p className="text-green-400 text-xs">{proposed.rationale}</p>
            </div>
          )}
        </div>
      )}
      {!isNew && !isRemoved && current && proposed && (
        <div className="flex gap-3 text-xs text-gray-500">
          <span>Risk: <RiskBadge l={proposed.likelihood} s={proposed.severity} /></span>
          <span>With controls: <RiskBadge l={proposed.likelihoodWithControls} s={proposed.severityWithControls} /></span>
        </div>
      )}
    </div>
  );
}

export default function RAProposalPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [proposal, setProposal] = useState<RAProposalData | null>(null);
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [tool, setTool] = useState<ToolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiFetch<RAProposalData>(`/api/ra-proposals/${id}`),
      apiFetch<DiffData>(`/api/ra-proposals/${id}/diff`),
    ])
      .then(async ([p, d]) => {
        setProposal(p);
        setDiff(d);
        try {
          const tools = await apiFetch<ToolInfo[]>("/api/inductions/tools");
          setTool(tools.find((t) => t.id === p.toolRecordId) ?? null);
        } catch { /* non-critical */ }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const canReview = user && (
    user.permissionLevel === "Admin" ||
    user.permissionLevel === "Approver" ||
    user.groupLevel === "Manager" ||
    isTeamLeaderPlus(user.groupLevel)
  );

  const handleApprove = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/ra-proposals/${id}/approve`, { method: "PUT" });
      setProposal((p) => p ? { ...p, status: "approved" } : p);
    } catch (e) { setError((e as Error).message); }
    finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/ra-proposals/${id}/reject`, {
        method: "PUT",
        body: JSON.stringify({ reason: rejectionReason }),
      });
      setProposal((p) => p ? { ...p, status: "rejected", rejectionReason } : p);
    } catch (e) { setError((e as Error).message); }
    finally { setActionLoading(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
    </div>
  );

  if (error || !proposal || !diff) {
    return (
      <div className="text-center">
        <p className="text-red-400">{error ?? "Proposal not found"}</p>
        <button type="button" onClick={() => navigate(-1)} className="mt-2 text-sm text-hacman-yellow underline">Go back</button>
      </div>
    );
  }

  const { current, proposed } = diff;
  const isPending = proposal.status === "pending";

  // Build merged hazard rows for diff display
  const currentMap = new Map(current.rows.map((r) => [r.id, r]));
  const proposedMap = new Map(proposed.rows.map((r) => [r.id, r]));
  const allIds = [...new Set([...currentMap.keys(), ...proposedMap.keys()])];

  const statusStyles: Record<string, string> = {
    pending: "bg-hacman-yellow/20 text-hacman-yellow border border-hacman-yellow/30",
    approved: "bg-green-500/20 text-green-400 border border-green-500/30",
    rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-hacman-yellow underline">← Back</button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">RA Proposal</h1>
          {tool && <p className="mt-1 text-sm text-hacman-muted">{tool.name} — Risk Assessment</p>}
          <div className="mt-2 flex items-center gap-3 text-sm text-hacman-muted">
            <span className={`rounded px-2 py-0.5 text-xs ${statusStyles[proposal.status] ?? ""}`}>{proposal.status}</span>
            <span>by {proposal.authorId}</span>
            <span>{new Date(proposal.createdAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
        </div>
        {tool && (
          <a href={`/inductions/risk-assessment/${proposal.toolRecordId}`}
            className="text-sm text-blue-400 hover:underline">
            View current RA
          </a>
        )}
      </div>

      {proposal.rejectionReason && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
          Rejection reason: {proposal.rejectionReason}
        </div>
      )}

      {/* Top-level field diffs */}
      <section className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
        <div className="border-b border-hacman-gray px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-hacman-muted">Requirements</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <FieldDiff label="Induction Required" before={current.inductionRequired ? "Yes" : "No"} after={proposed.inductionRequired ? "Yes" : "No"} />
          {(current.inductionRequired || proposed.inductionRequired) && (
            <FieldDiff label="Induction Details" before={current.inductionDetails} after={proposed.inductionDetails} />
          )}
          <FieldDiff label="PPE Required" before={current.ppeRequired} after={proposed.ppeRequired} />
          <FieldDiff label="Before Starting" before={current.beforeStarting} after={proposed.beforeStarting} />
        </div>
      </section>

      {/* Hazard diffs */}
      <section className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
        <div className="border-b border-hacman-gray px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-hacman-muted">
            Hazards — {current.rows.length} → {proposed.rows.length}
          </h2>
        </div>
        <div className="divide-y divide-hacman-gray/30 p-4 space-y-3">
          {allIds.map((rid) => (
            <HazardDiff
              key={rid}
              current={currentMap.get(rid) ?? null}
              proposed={proposedMap.get(rid) ?? null}
            />
          ))}
        </div>
      </section>

      {/* Document info diffs */}
      <section className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
        <div className="border-b border-hacman-gray px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-hacman-muted">Document Information</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
          <FieldDiff label="Created by" before={current.createdBy} after={proposed.createdBy} />
          <FieldDiff label="Created date" before={current.createdDate} after={proposed.createdDate} />
          <FieldDiff label="Updated by" before={current.updatedBy} after={proposed.updatedBy} />
          <FieldDiff label="Updated date" before={current.updatedDate} after={proposed.updatedDate} />
          <FieldDiff label="Review by" before={current.reviewBy} after={proposed.reviewBy} />
          <FieldDiff label="Review date" before={current.reviewDate} after={proposed.reviewDate} />
        </div>
      </section>

      {/* Review panel */}
      {isPending && canReview && (
        <div className="rounded-xl border border-hacman-gray bg-hacman-dark p-4 space-y-3">
          <h2 className="text-lg font-semibold text-white">Review</h2>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Rejection reason (required to reject):</label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded-lg border border-hacman-gray bg-hacman-black p-2 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:outline-none"
              rows={3}
              placeholder="Explain why this proposal should be rejected…"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleApprove}
              disabled={actionLoading}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={actionLoading || !rejectionReason.trim()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
