import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";

interface FeedItem {
  id: string;
  type: string;
  message: string;
  link: string | null;
  createdAt: number;
}

const typeIcons: Record<string, string> = {
  proposal: "📝",
  cert_expired: "🔴",
  cert_expiring: "⏰",
  pending_proposal: "📋",
  proposal_approved: "✅",
  proposal_rejected: "❌",
};

function timeAgo(epoch: number): string {
  const diff = Math.floor(Date.now() / 1000) - epoch;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationBell() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<FeedItem[]>("/api/notifications/feed")
      .then(setItems)
      .catch(() => {});
  }, []);

  // Poll every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      apiFetch<FeedItem[]>("/api/notifications/feed")
        .then(setItems)
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const count = items.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-1.5 text-gray-400 hover:bg-hacman-gray hover:text-hacman-yellow transition-colors"
        aria-label="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-hacman-yellow text-[10px] font-bold text-hacman-black">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-hacman-gray bg-hacman-dark shadow-xl shadow-black/40">
          <div className="border-b border-hacman-gray px-3 py-2 text-sm font-medium text-gray-300">
            Notifications
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-hacman-muted">All clear — nothing to see here</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-hacman-gray/50">
              {items.map((n) => {
                const icon = typeIcons[n.type] ?? "📌";
                const inner = (
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <span className="mt-0.5 text-sm">{icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-200 leading-snug">{n.message}</p>
                      <p className="mt-0.5 text-[10px] text-hacman-muted">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                );

                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        to={n.link}
                        onClick={() => setOpen(false)}
                        className="block hover:bg-hacman-gray/50 transition-colors"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="hover:bg-hacman-gray/50 transition-colors">
                        {inner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
