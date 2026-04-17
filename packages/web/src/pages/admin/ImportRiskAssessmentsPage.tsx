import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";

interface ImportResult {
  toolName: string;
  status: "imported" | "updated" | "error";
  error?: string;
}

interface ToolOption { id: string; name: string; }

interface PendingItem {
  toolName: string;
  content: unknown;
  selectedToolId: string;
}

interface PreviewItem {
  toolName: string;
  content: unknown;
  assignedToolId: string;
}

function parseItems(raw: string): PreviewItem[] | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const items: Array<{ toolName: string; content: unknown }> = Array.isArray(parsed.riskAssessments)
      ? parsed.riskAssessments as Array<{ toolName: string; content: unknown }>
      : parsed.toolName ? [{ toolName: parsed.toolName as string, content: parsed.content }] : [];
    return items.map((i) => ({ toolName: i.toolName ?? "", content: i.content, assignedToolId: "" }));
  } catch {
    return null;
  }
}

export default function ImportRiskAssessmentsPage() {
  const [json, setJson] = useState("");
  const [tools, setTools] = useState<ToolOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [failed, setFailed] = useState<PendingItem[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewItem[]>([]);

  // URL import state
  const [docUrl, setDocUrl] = useState("");
  const [urlToolId, setUrlToolId] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlResult, setUrlResult] = useState<{ status: string; error?: string } | null>(null);

  useEffect(() => {
    apiFetch<ToolOption[]>("/api/inductions/tools").then(setTools).catch(() => {});
  }, []);

  const jsonValid = useMemo(() => {
    if (!json.trim()) return null;
    return parseItems(json);
  }, [json]);

  const handleJsonChange = (val: string) => {
    setJson(val);
    setResults(null);
    setFailed([]);
    setError("");
    const items = parseItems(val);
    setPreview(items ?? []);
  };

  const handleImport = async () => {
    setError(""); setResults(null); setFailed([]);
    if (!jsonValid) {
      setError("Invalid JSON — check the output from the Google Apps Script.");
      return;
    }
    setLoading(true);
    try {
      // Apply any pre-assigned tool IDs from the preview panel
      const payload = preview.length > 0
        ? { riskAssessments: preview.map((p) => ({ toolName: p.toolName, content: p.content, ...(p.assignedToolId ? { toolId: p.assignedToolId } : {}) })) }
        : JSON.parse(json);

      const res = await apiFetch<{ results: ImportResult[] }>("/api/risk-assessments/import", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResults(res.results);

      const failedItems = res.results
        .filter((r) => r.status === "error")
        .map((r) => {
          const match = preview.find((i) => i.toolName === r.toolName);
          return { toolName: r.toolName, content: match?.content ?? null, selectedToolId: "" };
        })
        .filter((i) => i.content !== null) as PendingItem[];

      setFailed(failedItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    const toRetry = failed.filter((f) => f.selectedToolId);
    if (toRetry.length === 0) return;
    setRetrying(true);
    try {
      const res = await apiFetch<{ results: ImportResult[] }>("/api/risk-assessments/import", {
        method: "POST",
        body: JSON.stringify({
          riskAssessments: toRetry.map((f) => ({ toolId: f.selectedToolId, toolName: f.toolName, content: f.content })),
        }),
      });
      setResults((prev) => {
        if (!prev) return res.results;
        const updated = [...prev];
        res.results.forEach((r) => {
          const idx = updated.findIndex((p) => p.toolName === r.toolName);
          if (idx !== -1) updated[idx] = r; else updated.push(r);
        });
        return updated;
      });
      setFailed((prev) => prev.filter((f) => !toRetry.find((r) => r.toolName === f.toolName)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  const handleUrlImport = async () => {
    if (!docUrl.trim() || !urlToolId) return;
    setUrlLoading(true);
    setUrlResult(null);
    try {
      const res = await apiFetch<{ status: string; error?: string }>("/api/risk-assessments/import-url", {
        method: "POST",
        body: JSON.stringify({ url: docUrl.trim(), toolId: urlToolId }),
      });
      setUrlResult(res);
    } catch (e: unknown) {
      setUrlResult({ status: "error", error: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setUrlLoading(false);
    }
  };

  const imported = results?.filter((r) => r.status === "imported").length ?? 0;
  const updated  = results?.filter((r) => r.status === "updated").length ?? 0;
  const errors   = results?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="space-y-8">

      {/* ── Import from Google Doc URL ───────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-white">Import from Google Doc URL</h2>
        <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
          <p className="text-sm text-gray-400">
            Paste a Google Doc URL and select the tool to import into. The document must be set to{" "}
            <span className="text-gray-300">"Anyone with the link can view"</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-64">
            <label className="block text-xs text-hacman-muted mb-1">Google Doc URL</label>
            <input
              value={docUrl}
              onChange={(e) => { setDocUrl(e.target.value); setUrlResult(null); }}
              placeholder="https://docs.google.com/document/d/..."
              className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-gray-700 focus:border-hacman-yellow/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-hacman-muted mb-1">Tool</label>
            <select
              value={urlToolId}
              onChange={(e) => setUrlToolId(e.target.value)}
              className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1.5 text-sm text-gray-200 focus:border-hacman-yellow/50 focus:outline-none"
            >
              <option value="">— select tool —</option>
              {tools.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button
            onClick={handleUrlImport}
            disabled={urlLoading || !docUrl.trim() || !urlToolId}
            className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors disabled:opacity-50"
          >
            {urlLoading ? "Importing…" : "Import"}
          </button>
        </div>
        {urlResult && (
          <div className={`rounded-lg px-4 py-3 text-sm ${urlResult.status === "error" ? "border border-red-500/30 bg-red-500/10 text-red-400" : "border border-green-500/30 bg-green-500/10 text-green-400"}`}>
            {urlResult.status === "imported" && "Imported successfully as draft."}
            {urlResult.status === "updated" && "Existing risk assessment updated."}
            {urlResult.status === "error" && (urlResult.error ?? "Import failed.")}
          </div>
        )}
      </div>

      <div className="border-t border-hacman-gray/50" />

      {/* ── Import from JSON ─────────────────────────────────────── */}
      <div className="space-y-6">
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">
          Or paste the JSON output from the{" "}
          <code className="rounded bg-hacman-gray px-1 text-xs text-gray-300">export-google-docs-ra.gs</code>{" "}
          Google Apps Script. Tool names are matched automatically — assign them manually below if needed before importing.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-hacman-muted">
          JSON from Google Apps Script
        </label>
        <textarea
          value={json}
          onChange={(e) => handleJsonChange(e.target.value)}
          rows={14}
          placeholder={'{\n  "riskAssessments": [\n    {\n      "toolName": "Angle Grinder",\n      "content": { ... }\n    }\n  ]\n}'}
          className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2 font-mono text-xs text-gray-200 placeholder-gray-700 focus:border-hacman-yellow/50 focus:outline-none"
        />
      </div>

      {/* ── Pre-import tool assignment ───────────────────────────── */}
      {preview.length > 0 && !results && (
        <div className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
          <div className="border-b border-hacman-gray px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-200">
              {preview.length} risk assessment{preview.length > 1 ? "s" : ""} found
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Tool names are matched automatically by name. Override a tool assignment here if needed.
            </p>
          </div>
          <div className="divide-y divide-hacman-gray/50">
            {preview.map((p, i) => {
              const autoMatch = tools.find((t) => t.name.toLowerCase() === p.toolName.toLowerCase());
              return (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-200">"{p.toolName}"</p>
                    {autoMatch && !p.assignedToolId && (
                      <p className="text-xs text-green-400">Auto-matched → {autoMatch.name}</p>
                    )}
                    {!autoMatch && !p.assignedToolId && (
                      <p className="text-xs text-amber-400">No auto-match — assign below or import will fail</p>
                    )}
                  </div>
                  <select
                    value={p.assignedToolId}
                    onChange={(e) => setPreview((prev) => prev.map((item, idx) =>
                      idx === i ? { ...item, assignedToolId: e.target.value } : item
                    ))}
                    className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow/50 focus:outline-none"
                  >
                    <option value="">{autoMatch ? `Auto: ${autoMatch.name}` : "— assign tool —"}</option>
                    {tools.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {json.trim() && jsonValid === null && (
        <p className="text-sm text-red-400">Invalid JSON — check the output from the Google Apps Script.</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleImport}
          disabled={loading || !json.trim() || jsonValid === null}
          className="rounded-lg bg-hacman-yellow px-5 py-2 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors disabled:opacity-50"
        >
          {loading ? "Importing…" : "Import"}
        </button>
        {json && (
          <button onClick={() => { setJson(""); setResults(null); setFailed([]); setError(""); setPreview([]); }}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* ── Results ──────────────────────────────────────────────── */}
      {results && (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            {imported > 0 && <span className="text-green-400 font-medium">{imported} created</span>}
            {updated  > 0 && <span className="text-blue-400 font-medium">{updated} updated</span>}
            {errors   > 0 && <span className="text-red-400 font-medium">{errors} failed</span>}
          </div>

          <div className="rounded-xl border border-hacman-gray bg-hacman-dark overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hacman-gray bg-hacman-gray/30">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Tool</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-hacman-gray/50">
                    <td className="px-4 py-2 text-gray-200">{r.toolName}</td>
                    <td className="px-4 py-2">
                      {r.status === "imported" && <span className="text-green-400">Created</span>}
                      {r.status === "updated"  && <span className="text-blue-400">Updated</span>}
                      {r.status === "error"    && <span className="text-red-400">Failed — {r.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Manual tool assignment for failed items ─────────── */}
          {failed.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
              <div className="border-b border-amber-500/20 px-4 py-3">
                <h3 className="text-sm font-semibold text-amber-400">
                  {failed.length} tool name{failed.length > 1 ? "s" : ""} didn't match — assign manually
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Select the matching tool from the dropdown for each unmatched RA, then click Retry.
                </p>
              </div>
              <div className="divide-y divide-amber-500/10">
                {failed.map((f, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-300 font-medium">"{f.toolName}"</p>
                      <p className="text-xs text-gray-500">from import</p>
                    </div>
                    <span className="text-gray-600">→</span>
                    <select
                      value={f.selectedToolId}
                      onChange={(e) => setFailed((prev) => prev.map((item, idx) =>
                        idx === i ? { ...item, selectedToolId: e.target.value } : item
                      ))}
                      className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow/50 focus:outline-none"
                    >
                      <option value="">— select tool —</option>
                      {tools.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="border-t border-amber-500/20 px-4 py-3">
                <button
                  onClick={handleRetry}
                  disabled={retrying || failed.every((f) => !f.selectedToolId)}
                  className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors disabled:opacity-50"
                >
                  {retrying ? "Retrying…" : "Retry Assigned"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </div> {/* end JSON import section */}
    </div>
  );
}
