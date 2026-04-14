import { useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { ImportReport } from "@hacmandocs/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

function ReportDisplay({ report }: { report: ImportReport }) {
  return (
    <div className="mt-4 rounded-lg border border-hacman-gray bg-hacman-dark p-4 text-sm text-gray-200">
      <p>Total files: {report.totalFiles}</p>
      <p>Imported: {report.importedCount}</p>
      {report.failures.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-red-400">
            Failures ({report.failures.length})
          </summary>
          <ul className="mt-1 ml-4 list-disc text-gray-400">
            {report.failures.map((f, i) => (
              <li key={i}>{f.filePath}: {f.reason}</li>
            ))}
          </ul>
        </details>
      )}
      {report.warnings.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-amber-400">
            Warnings ({report.warnings.length})
          </summary>
          <ul className="mt-1 ml-4 list-disc text-gray-400">
            {report.warnings.map((w, i) => (
              <li key={i}>{w.filePath}: {w.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function ImportPage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleGitHubImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const r = await apiFetch<ImportReport>("/api/import", {
        method: "POST",
        body: JSON.stringify({ repoUrl }),
      });
      setReport(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleZipUpload = async (uploadFile?: File) => {
    const file = uploadFile ?? fileRef.current?.files?.[0];
    if (!file) {
      // No file selected yet — open the file picker
      fileRef.current?.click();
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("session_token");
      const res = await fetch(`${API_URL}/api/import/zip`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const r = (await res.json()) as ImportReport;
      setReport(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">Import documents from a GitHub repository or upload a ZIP of Markdown files. Existing documents with the same title will be updated.</p>
      </div>

      {/* GitHub import */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-200">Import from GitHub</h3>
        <p className="mb-2 text-xs text-hacman-muted">
          Supports full URLs with branch and path, e.g.
          https://github.com/owner/repo/tree/master/docs
        </p>
        <form onSubmit={handleGitHubImport} className="flex gap-2">
          <label htmlFor="repo-url" className="sr-only">GitHub repository URL</label>
          <input
            id="repo-url"
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/tree/master/docs"
            required
            className="flex-1 rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark disabled:opacity-50"
          >
            {loading ? "Importing…" : "Import"}
          </button>
        </form>
      </div>

      {/* ZIP upload */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-200">Upload ZIP of Markdown files</h3>
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleZipUpload(f);
          }}
        />
        <button
          type="button"
          onClick={() => handleZipUpload()}
          disabled={loading}
          className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark disabled:opacity-50"
        >
          {loading ? "Uploading…" : "Choose ZIP & Import"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {report && <ReportDisplay report={report} />}
    </div>
  );
}
