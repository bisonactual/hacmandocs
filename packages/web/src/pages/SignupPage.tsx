import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import HacmanLogo from "../components/HacmanLogo";

export default function SignupPage() {
  const { loginWithMember } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hackspaceUsername, setHackspaceUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      // 1. Create account via member login (auto-creates user)
      await loginWithMember(username, password);

      // 2. Set hackspace username
      await apiFetch("/api/users/me/username", {
        method: "PUT",
        body: JSON.stringify({ username: hackspaceUsername.trim() }),
      });

      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hacman-black">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-hacman-gray bg-hacman-dark p-8 shadow-2xl shadow-black/50">
        <div className="flex flex-col items-center gap-3">
          <HacmanLogo className="h-10 text-white" />
          <p className="text-xs uppercase tracking-widest text-hacman-muted">
            Create your account
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="signup-username" className="block text-sm font-medium text-gray-300">
              Username
            </label>
            <input
              id="signup-username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2.5 text-gray-200 shadow-sm placeholder-hacman-muted focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow transition-colors"
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="block text-sm font-medium text-gray-300">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2.5 text-gray-200 shadow-sm placeholder-hacman-muted focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow transition-colors"
            />
          </div>

          <div>
            <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-gray-300">
              Confirm Password
            </label>
            <input
              id="signup-confirm-password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2.5 text-gray-200 shadow-sm placeholder-hacman-muted focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow transition-colors"
            />
          </div>

          <div>
            <label htmlFor="signup-hackspace-username" className="block text-sm font-medium text-gray-300">
              Hackspace Username
            </label>
            <p className="mt-0.5 text-xs text-hacman-muted">
              Your Hackspace Manchester membership username
            </p>
            <input
              id="signup-hackspace-username"
              type="text"
              required
              value={hackspaceUsername}
              onChange={(e) => setHackspaceUsername(e.target.value)}
              placeholder="e.g. jsmith"
              className="mt-1 block w-full rounded-lg border border-hacman-gray bg-hacman-black px-3 py-2.5 text-gray-200 shadow-sm placeholder-hacman-muted focus:border-hacman-yellow focus:outline-none focus:ring-1 focus:ring-hacman-yellow transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-hacman-yellow px-4 py-2.5 font-semibold text-hacman-black hover:bg-hacman-yellow-dark disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="text-center text-sm text-hacman-muted">
          Already have an account?{" "}
          <Link to="/login" className="text-hacman-yellow hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
