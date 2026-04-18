import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

interface LeaderboardData {
  topEditors: Array<{ userId: string; name: string; count: number }>;
  topTrainers: Array<{ userId: string; name: string; count: number }>;
}

function Medal({ rank }: { rank: number }) {
  if (rank === 0) return <span className="text-lg">🥇</span>;
  if (rank === 1) return <span className="text-lg">🥈</span>;
  if (rank === 2) return <span className="text-lg">🥉</span>;
  return <span className="w-6 text-center text-sm text-hacman-muted">{rank + 1}</span>;
}

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<LeaderboardData>("/api/leaderboard")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" />
    </div>
  );

  if (!data) return <p className="text-hacman-muted">Failed to load leaderboard.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-hacman-text">🏆 Community Top 5</h1>
        <p className="mt-1 text-sm text-hacman-muted">Recognising our most active contributors</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Top Editors */}
        <div className="rounded-xl border border-hacman-gray bg-hacman-dark p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-hacman-text">
            <span>📝</span> Top Editors
          </h2>
          {data.topEditors.length === 0 ? (
            <p className="text-sm text-hacman-muted">No approved edits yet</p>
          ) : (
            <ol className="space-y-2">
              {data.topEditors.map((e, i) => (
                <li key={e.userId} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                  <Medal rank={i} />
                  <span className="flex-1 text-sm text-gray-200">{e.name}</span>
                  <span className="text-sm font-medium text-hacman-yellow">{e.count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Top Trainers */}
        <div className="rounded-xl border border-hacman-gray bg-hacman-dark p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-hacman-text">
            <span>👨‍🏫</span> Top Trainers
          </h2>
          {data.topTrainers.length === 0 ? (
            <p className="text-sm text-hacman-muted">No sign-offs recorded yet</p>
          ) : (
            <ol className="space-y-2">
              {data.topTrainers.map((t, i) => (
                <li key={t.userId} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                  <Medal rank={i} />
                  <span className="flex-1 text-sm text-gray-200">{t.name}</span>
                  <span className="text-sm font-medium text-hacman-yellow">{t.count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
