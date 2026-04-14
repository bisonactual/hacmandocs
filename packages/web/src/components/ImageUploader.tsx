import { useState, useRef, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

interface ImageUploaderProps {
  /** Current image URL (relative like /api/images/xxx or full URL) */
  value: string | null;
  /** Called with the new image URL after upload, or null on remove */
  onChange: (url: string | null) => void;
}

async function uploadFile(file: File): Promise<string> {
  const token = localStorage.getItem("session_token");
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/api/images/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Upload failed (${res.status})`);
  }

  const { url } = (await res.json()) as { url: string };
  return url;
}

function resolveUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `${API_URL}${url}`;
}

export default function ImageUploader({ value, onChange }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const url = await uploadFile(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) handleFile(file);
  }, [handleFile]);

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) { handleFile(file); break; }
      }
    }
  }, [handleFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  return (
    <div className="space-y-2">
      <label className="block text-xs text-hacman-muted">Tool Image</label>

      {value && (
        <div className="relative inline-block">
          <img
            src={resolveUrl(value)}
            alt="Tool"
            className="h-24 w-24 rounded-lg border border-hacman-gray object-cover"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
            aria-label="Remove image"
          >
            ×
          </button>
        </div>
      )}

      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onPaste={onPaste}
        tabIndex={0}
        role="button"
        aria-label="Upload image by dropping, pasting, or clicking"
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          dragOver
            ? "border-hacman-yellow bg-hacman-yellow/10"
            : "border-hacman-gray hover:border-hacman-yellow/50"
        }`}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? (
          <span className="text-sm text-hacman-muted">Uploading…</span>
        ) : (
          <>
            <span className="text-2xl">📷</span>
            <span className="mt-1 text-xs text-hacman-muted">
              Drop, paste, or click to upload
            </span>
            <span className="text-xs text-gray-500">
              JPEG, PNG, GIF, WebP, SVG — max 5 MB
            </span>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
