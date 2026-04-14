const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

/**
 * Fetch wrapper that automatically includes the session token
 * and prefixes the API base URL.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem("session_token");

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Only redirect to login for authenticated routes, not public ones
    const isPublicPath = path.startsWith("/api/documents") || path.startsWith("/api/categories") || path.startsWith("/api/search");
    if (!isPublicPath) {
      localStorage.removeItem("session_token");
      window.location.href = import.meta.env.BASE_URL + "login";
    }
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
