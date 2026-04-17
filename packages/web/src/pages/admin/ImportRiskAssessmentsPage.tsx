import { useState } from "react";
import { apiFetch } from "../../lib/api";

interface ImportResult {
  toolName: string;
  status: "imported" | "updated" | "error";
  error?: string;
}

export default function ImportRiskAssessmentsPage() {
  const [json, setJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [error, setError] = useState("");

  const handleImport = async () => {
    setError(""); setResults(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("Invalid JSON — check the output from the Google Apps Script.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ results: ImportResult[] }>("/api/risk-assessments/import", {
        method: "POST",
        body: JSON.stringify(parsed),
      });
      setResults(res.results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const imported = results?.filter((r) => r.status === "imported").length ?? 0;
  const updated  = results?.filter((r) => r.status === "updated").length ?? 0;
  const errors   = results?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">
          Paste the JSON output from the <code className="rounded bg-hacman-gray px-1 text-xs text-gray-300">export-google-sheets-ra.gs</code> Google Apps Script.
          Tool names in the JSON must exactly match tool names in the system.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-hacman-muted">
          JSON from Google Apps Script
        </label>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={16}
          placeholder={'{\n  "riskAssessments": [\n    {\n      "toolName": "Angle Grinder",\n      "content": { ... }\n    }\n  ]\n}'}
          className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2 font-mono text-xs text-gray-200 placeholder-gray-700 focus:border-hacman-yellow/50 focus:outline-none"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleImport}
          disabled={loading || !json.trim()}
          className="rounded-lg bg-hacman-yellow px-5 py-2 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors disabled:opacity-50"
        >
          {loading ? "Importing…" : "Import"}
        </button>
        {json && (
          <button onClick={() => { setJson(""); setResults(null); setError(""); }}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Clear
          </button>
        )}
      </div>

      {results && (
        <div className="space-y-3">
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
                      {r.status === "error"    && <span className="text-red-400">Error: {r.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
