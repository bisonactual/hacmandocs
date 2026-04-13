import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

interface NotificationItem {
  id: string;
  type: string;
  proposalId: string;
  isRead: boolean;
  createdAt: number;
}

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<NotificationItem[]>("/api/notifications")
      .then(setItems)
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadCount = items.filter((n) => !n.isRead).length;

  const markRead = useCallback(async (id: string) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: "PUT" }).catch(
      () => {},
    );
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-1 text-gray-600 hover:bg-gray-100"
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2 text-sm font-medium text-gray-700">
            Notifications
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-gray-400">
              No notifications
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                      n.isRead ? "text-gray-400" : "font-medium text-gray-700"
                    }`}
                  >
                    <span className="block">{n.type}</span>
                    <span className="text-[10px] text-gray-400">
                      Proposal {n.proposalId.slice(0, 8)}… ·{" "}
                      {new Date(n.createdAt * 1000).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
