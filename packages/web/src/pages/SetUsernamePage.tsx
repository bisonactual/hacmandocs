import { useState } from "react";
import type { FormEvent } from "react";
import { apiFetch } from "../lib/api";

export default function SetUsernamePage({ onComplete }: { onComplete: () => void }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/users/me/username", {
        method: "PUT",
        body: JSON.stringify({ username: username.trim() }),
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set username");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hacman-black">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-hacman-gray bg-hacman-dark p-8 shadow-2xl shadow-black/50">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-hacman-text">Set your hackspace username</h2>
          <p className="mt-2 text-sm text-hacman-muted">
            This should match your Hackspace Manchester membership username.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="hackspace-username" className="block text-sm font-medium text-gray-300">
              Username
            </label>
            <input
              id="hackspace-username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. jsmith"
              className="mt-1 block w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2.5 text-gray-200 shadow-sm placeholder-hacman-muted focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full rounded-lg bg-hacman-yellow px-4 py-2.5 font-semibold text-hacman-black hover:bg-hacman-yellow-dark disabled:opacity-50 transition-colors"
          >
            {loading ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
