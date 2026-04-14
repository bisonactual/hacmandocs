import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import HacmanLogo from "../components/HacmanLogo";

export default function LoginPage() {
  const { loginWithMember, loginWithOAuth, loading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleMemberLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await loginWithMember(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hacman-black">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-hacman-gray bg-hacman-dark p-8 shadow-2xl shadow-black/50">
        <div className="flex flex-col items-center gap-3">
          <HacmanLogo className="h-10 text-white" />
          <p className="text-xs uppercase tracking-widest text-hacman-muted">
            Documentation &amp; Training Portal
          </p>
        </div>

        {/* OAuth login */}
        <button
          type="button"
          onClick={loginWithOAuth}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-hacman-yellow px-4 py-2.5 font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          Sign in with GitHub
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-hacman-gray" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-hacman-dark px-3 text-hacman-muted">
              or use member credentials
            </span>
          </div>
        </div>

        {/* Member login form */}
        <form onSubmit={handleMemberLogin} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300">
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2.5 text-gray-200 shadow-sm placeholder-hacman-muted focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow transition-colors"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2.5 text-gray-200 shadow-sm placeholder-hacman-muted focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg border border-hacman-yellow bg-transparent px-4 py-2.5 font-medium text-hacman-yellow hover:bg-hacman-yellow hover:text-hacman-black disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
