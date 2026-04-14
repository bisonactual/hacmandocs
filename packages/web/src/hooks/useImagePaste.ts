import { useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

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
 * Returns a paste event handler that intercepts pasted images,
 * uploads them, and calls onInsert with a markdown image tag.
 *
 * Attach to onPaste on any input or textarea.
 */
export function useImagePaste(onInsert: (markdown: string) => void) {
  return useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          try {
            const url = await uploadFile(file);
            onInsert(`![image](${url})`);
          } catch {
            // upload failed silently
          }
          return;
        }
      }
      // Not an image paste — let the default behavior through
    },
    [onInsert],
  );
}
