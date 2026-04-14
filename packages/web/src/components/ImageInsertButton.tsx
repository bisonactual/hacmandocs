import { useState, useRef, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

interface ImageInsertButtonProps {
  /** Called with the markdown image string e.g. `![image](/api/images/xxx.png)` */
  onInsert: (markdown: string) => void;
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
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

/**
 * Small button that lets users upload/paste an image and inserts
 * a markdown image tag via the onInsert callback.
 * Designed to sit next to text inputs and textareas.
 */
export default function ImageInsertButton({ onInsert }: ImageInsertButtonProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      onInsert(`![image](${url})`);
    } catch {
      // silently fail — the upload endpoint shows errors in console
    } finally {
      setUploading(false);
    }
  }, [onInsert]);

  return (
    <>
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        title="Upload and insert image"
        className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-hacman-gray hover:text-hacman-yellow disabled:opacity-40"
      >
        {uploading ? "Uploading…" : "📷 Image"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
