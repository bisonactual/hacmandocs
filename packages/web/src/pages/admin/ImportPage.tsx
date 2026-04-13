import { useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { ImportReport } from "@hacmandocs/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

function ReportDisplay({ report }: { report: ImportReport }) {
  return (
    <div className="mt-4 rounded border border-gray-200 bg-white p-4 text-sm">
      <p>Total files: {report.totalFiles}</p>
      <p>Imported: {report.importedCount}</p>
      {report.failures.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-red-600">
            Failures ({report.failures.length})
          </summary>
          <ul className="mt-1 ml-4 list-disc text-gray-600">
            {report.failures.map((f, i) => (
              <li key={i}>{f.filePath}: {f.reason}</li>
            ))}
          </ul>
        </details>
      )}
      {report.warnings.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-amber-600">
            Warnings ({report.warnings.length})
          </summary>
          <ul className="mt-1 ml-4 list-disc text-gray-600">
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
      {/* GitHub import */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Import from GitHub</h3>
        <p className="mb-2 text-xs text-gray-500">
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
            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Importing…" : "Import"}
          </button>
        </form>
      </div>

      {/* ZIP upload */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Upload ZIP of Markdown files</h3>
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
          className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Uploading…" : "Choose ZIP & Import"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {report && <ReportDisplay report={report} />}
    </div>
  );
}
