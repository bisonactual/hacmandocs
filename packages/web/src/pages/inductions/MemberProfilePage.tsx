import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";

interface ToolInfo {
  id: string;
  name: string;
  quizId: string | null;
  preInductionQuizId: string | null;
  refresherQuizId: string | null;
  retrainingIntervalDays: number | null;
  passedPreInduction?: boolean;
}

interface CertData {
  id: string;
  completedAt: number;
  expiresAt: number | null;
  status: string;
}

interface CompletedTool {
  id: string;
  name: string;
  quizId: string | null;
  refresherQuizId: string | null;
  retrainingIntervalDays: number | null;
  certification: CertData | null;
}

interface ExpiredTool {
  id: string;
  name: string;
  quizId: string | null;
  refresherQuizId: string | null;
  retrainingIntervalDays: number | null;
  certification: CertData | null;
}

interface ProfileData {
  available: ToolInfo[];
  completed: CompletedTool[];
  expired: ExpiredTool[];
}

function quizRoleBadge(role: string) {
  const map: Record<string, { label: string; cls: string }> = {
    online: { label: "Online Induction", cls: "bg-blue-500/20 text-blue-400 border border-blue-500/30" },
    pre: { label: "Pre-Induction Quiz", cls: "bg-purple-500/20 text-purple-400 border border-purple-500/30" },
    refresher: { label: "Refresher Quiz", cls: "bg-amber-500/20 text-amber-400 border border-amber-500/30" },
    signoff: { label: "In-Person Induction", cls: "bg-green-500/20 text-green-400 border border-green-500/30" },
  };
  const m = map[role] ?? { label: role, cls: "bg-hacman-gray text-hacman-muted" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

export default function MemberProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch<ProfileData>("/api/inductions/profile/me")
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const markTrained = async (toolId: string) => {
    setMarking(toolId);
    try {
      await apiFetch(`/api/inductions/tools/${toolId}/mark-trained`, { method: "POST" });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to mark as trained");
    } finally {
      setMarking(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
    </div>
  );
  if (error && !profile) return <p className="text-red-400">{error}</p>;
  if (!profile) return null;

  const now = Math.floor(Date.now() / 1000);

  const availableQuizzes = profile.available.filter(
    (t) => t.quizId || t.preInductionQuizId,
  );
  const awaitingInduction = profile.available.filter(
    (t) => t.passedPreInduction && !t.quizId,
  );
  const signoffOnly = profile.available.filter(
    (t) => !t.quizId && !t.preInductionQuizId && !t.refresherQuizId,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div>
        <h2 className="text-2xl font-bold text-white">My Training Profile</h2>
        <p className="mt-1 text-hacman-muted">Track your inductions, certifications, and refresher courses</p>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-hacman-yellow/20 bg-hacman-yellow/5 p-5">
        <h3 className="text-sm font-semibold text-hacman-yellow mb-2">How Training Works</h3>
        <ul className="space-y-1.5 text-sm text-gray-300">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-xs font-bold text-blue-400">1</span>
            <span>Some tools have an online induction quiz — complete it to become trained.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded-full bg-purple-500/20 px-1.5 py-0.5 text-xs font-bold text-purple-400">2</span>
            <span>Some tools require a pre-induction quiz first, then an in-person training session with a trainer.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-bold text-amber-400">3</span>
            <span>Refresher courses keep your certification current — complete them before your training expires.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded-full bg-green-500/20 px-1.5 py-0.5 text-xs font-bold text-green-400">4</span>
            <span>Already trained on a tool? Use "Mark Me Trained" to register your existing training.</span>
          </li>
        </ul>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Available Training */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-lg">📋</span>
          <h3 className="text-lg font-semibold text-white">Available Training</h3>
        </div>
        {availableQuizzes.length === 0 && signoffOnly.length === 0 && awaitingInduction.length === 0 ? (
          <div className="rounded-xl border border-hacman-gray bg-hacman-dark p-6 text-center">
            <p className="text-sm text-hacman-muted">No training available — you've completed them all! 🎉</p>
          </div>
        ) : (
          <div className="space-y-2">
            {availableQuizzes.map((tool) => {
              const showPreInduction = tool.preInductionQuizId && !tool.passedPreInduction;
              const showOnline = tool.quizId && !showPreInduction;
              const quizIdToStart = showPreInduction ? tool.preInductionQuizId : tool.quizId;

              return (
                <div key={tool.id} className="flex items-center justify-between rounded-xl border border-hacman-gray bg-hacman-dark px-5 py-4 transition hover:border-hacman-yellow/30">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{tool.name}</span>
                    {showPreInduction && quizRoleBadge("pre")}
                    {showOnline && quizRoleBadge("online")}
                  </div>
                  <div className="flex items-center gap-2">
                    {quizIdToStart && (
                      <Link
                        to={`/inductions/quiz/${quizIdToStart}`}
                        className="rounded-lg bg-hacman-yellow px-4 py-2 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors"
                      >
                        Start Quiz
                      </Link>
                    )}
                    <button
                      onClick={() => markTrained(tool.id)}
                      disabled={marking === tool.id}
                      className="rounded-lg border border-hacman-gray px-3 py-2 text-sm text-gray-400 hover:border-hacman-yellow hover:text-hacman-yellow transition-colors disabled:opacity-50"
                    >
                      {marking === tool.id ? "…" : "Mark Me Trained"}
                    </button>
                  </div>
                </div>
              );
            })}

            {awaitingInduction.map((tool) => (
              <div key={tool.id} className="flex items-center justify-between rounded-xl border border-purple-500/30 bg-purple-500/5 px-5 py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{tool.name}</span>
                    {quizRoleBadge("signoff")}
                  </div>
                  <p className="text-xs text-purple-400">Pre-induction passed. Contact a trainer to book your in-person session.</p>
                </div>
              </div>
            ))}

            {signoffOnly.map((tool) => (
              <div key={tool.id} className="flex items-center justify-between rounded-xl border border-hacman-gray bg-hacman-dark px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-white">{tool.name}</span>
                  {quizRoleBadge("signoff")}
                </div>
                <button
                  onClick={() => markTrained(tool.id)}
                  disabled={marking === tool.id}
                  className="rounded-lg border border-hacman-gray px-3 py-2 text-sm text-gray-400 hover:border-hacman-yellow hover:text-hacman-yellow transition-colors disabled:opacity-50"
                >
                  {marking === tool.id ? "…" : "Mark Me Trained"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active Certifications */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-lg">✅</span>
          <h3 className="text-lg font-semibold text-white">Active Certifications</h3>
        </div>
        {profile.completed.length === 0 ? (
          <div className="rounded-xl border border-hacman-gray bg-hacman-dark p-6 text-center">
            <p className="text-sm text-hacman-muted">No certifications yet. Complete training above to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {profile.completed.map((tool) => {
              const cert = tool.certification;
              const daysRemaining = cert?.expiresAt ? Math.ceil((cert.expiresAt - now) / 86400) : null;
              return (
                <div key={tool.id} className="flex items-center justify-between rounded-xl border border-hacman-gray bg-hacman-dark px-5 py-4">
                  <div className="space-y-1">
                    <span className="font-medium text-white">{tool.name}</span>
                    <div className="flex items-center gap-3 text-xs text-hacman-muted">
                      {cert && <span>Completed {new Date(cert.completedAt * 1000).toLocaleDateString()}</span>}
                      {daysRemaining !== null && daysRemaining > 0 && (
                        <span className={daysRemaining <= 30 ? "font-medium text-amber-400" : "text-gray-400"}>
                          {daysRemaining} days remaining
                        </span>
                      )}
                      {cert?.expiresAt === null && <span className="text-green-400 font-medium">Permanent</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {tool.refresherQuizId && (
                      <Link
                        to={`/inductions/quiz/${tool.refresherQuizId}`}
                        className="rounded-lg bg-amber-500/20 border border-amber-500/30 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/30 transition-colors"
                      >
                        Refresher Course
                      </Link>
                    )}
                    <span className="rounded-full bg-green-500/20 border border-green-500/30 px-3 py-1 text-xs font-medium text-green-400">Active</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Expired Certifications */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <h3 className="text-lg font-semibold text-white">Expired Certifications</h3>
        </div>
        {profile.expired.length === 0 ? (
          <div className="rounded-xl border border-hacman-gray bg-hacman-dark p-6 text-center">
            <p className="text-sm text-hacman-muted">No expired certifications. You're all up to date.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {profile.expired.map((tool) => {
              const cert = tool.certification;
              return (
                <div key={tool.id} className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
                  <div className="space-y-1">
                    <span className="font-medium text-white">{tool.name}</span>
                    <span className="block text-xs text-red-400">
                      Expired {cert?.expiresAt ? new Date(cert.expiresAt * 1000).toLocaleDateString() : ""}
                    </span>
                  </div>
                  {tool.refresherQuizId ? (
                    <Link
                      to={`/inductions/quiz/${tool.refresherQuizId}`}
                      className="rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                      Take Refresher
                    </Link>
                  ) : (
                    <button
                      onClick={() => markTrained(tool.id)}
                      disabled={marking === tool.id}
                      className="rounded-lg border border-hacman-gray px-3 py-2 text-sm text-gray-400 hover:border-hacman-yellow hover:text-hacman-yellow transition-colors disabled:opacity-50"
                    >
                      {marking === tool.id ? "…" : "Mark Me Trained"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
